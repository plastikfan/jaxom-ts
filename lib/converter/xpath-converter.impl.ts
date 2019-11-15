
import * as R from 'ramda';
let moment = require('moment'); // why doesn't normal TS import work?
import * as xpath from 'xpath-ts';

import * as types from './types';
import * as e from './exceptions';
import { Specs, CollectionTypePlaceHolder, CollectionTypeLabel } from './specs';
import { functify } from 'jinxed';

/**
 * @description Internal implementation interface which is required due to the fact that
 * transform operations are chained together (a bit like chain of responsibility). That
 * is to say, that for a particular value being parsed from the xml (either from a text
 * node or attribute value), each transform function may succeed or fail. When a fail occurs
 * by a particular transform function, that doesn't mean a real error. All it means is that
 * that transform function is not applicable to that value, so we should just try the next
 * transform in the chain. This is why we can't throw an exception from a transform function
 * and instead need a boolean flag (@value) as well as the transformed result (@succeeded).
 * The only time we can throw an exception is if the user has defined the string transform
 * (via the string boolean flag) to be false. All values in xml source are clearly a string
 * therefore but if the user has defined various other transforms one of which must succeed,
 * we can prevent a raw string representation being returned if that's required.
 *
 * @export
 * @interface ITransformResult
 * @template T
 */
export interface ITransformResult<T> {
  value: T;
  succeeded: boolean;
}

export interface ITransformFunction<T> {
  (s: string, v: any, c: types.ContextType): ITransformResult<T>;
}

/**
 * @export
 * @class XpathConverterImpl
 * @implements {types.IConverter}
 */
export class XpathConverterImpl implements types.IConverterImpl {
  /**
   * Creates an instance of XpathConverterImpl.
   * @param {types.ISpec} [spec=Specs.default] The XpathConverterImpl uses a spec to define
   * the conversion behaviour. A user may wish to override some of these settings, in which
   * case, they can pass in a partial spec (Partial here means that the custom spec does
   * not have to repeat all of the default fields that it does not wish to override). If
   * a setting is not found in the custom spec, that setting will be taken from the default
   * except where that setting is not default-able; please see the ISpec interface.
   *
   * @memberof XpathConverterImpl
   */
  constructor (private spec: types.ISpec = Specs.default) {
    if (!spec) {
      throw new Error('null spec not permitted');
    }

    this.makeTransformers();
  }

  /**
   * @method initialise
   * @description Performs static initialisation of the class (Does NOT need to be called by
   * the client, even though it is public)
   * @static
   * @memberof XpathConverterImpl
   */
  static initialise (): void {
    this.typeExpr = /\<(?<type>[\w\[\]]+)\>/;
  }

  /**
   * @method buildElement
   * @description builds the native object representing an element, and recurses in 2 dimensions;
   * by the "recurse" attribute (usually "inherits") and via the element's direct descendants.
   * @private
   * @param {*} elementNode
   * @param {types.IParseInfo} parseInfo
   * @param {string[]} [previouslySeen=[]]
   * @returns
   * @memberof XpathConverterImpl
   */
  buildElement (elementNode: Node, parseInfo: types.IParseInfo,
    previouslySeen: string[] = []): any {

    const subject = composeElementPath(elementNode);
    let element: any = this.buildLocalAttributes(subject, elementNode);
    const elementLabel = this.fetchSpecOption('labels/element') as string;

    element[elementLabel] = elementNode.nodeName;

    const { recurse = '', discards = [] } = this.getElementInfo(elementNode.nodeName, parseInfo);

    if ((recurse !== '') && (elementNode instanceof Element)) {
      element = this.recurseThroughAttribute(subject, element, elementNode, elementNode.parentNode,
        parseInfo, previouslySeen);
    }

    // Finally, filter out attributes we don't need on the final built native element
    //
    R.forEach(at => {
      element = R.dissoc(at, element);
    }, discards);

    if (elementNode.hasChildNodes()) {
      element = this.buildChildren(subject, element, elementNode, parseInfo, previouslySeen);
    }

    return element;
  } // buildElement

  /**
   * @method buildLocalAttributes
   * @description Selects all the attributes from the "localNode"
   * @private
   * @param {string} subject: Identifies the current xml entity
   * @param {*} localNode
   * @returns
   * @memberof XpathConverterImpl
   */
  private buildLocalAttributes (subject: string, localNode: Node): {} {
    // First collect all the attributes (@*) -> create attribute nodes
    // node.nodeType = 2 (ATTRIBUTE_NODE). By implication of the xpath query
    // (ie, we're selecting all attributes) all the nodeTypes of the nodes
    // returned should all be = 2; we could check with a ramda call, but is this
    // necessary?
    //
    const attributeNodes: types.SelectResult = xpath.select('@*', localNode);
    let element: any = {};

    if (attributeNodes && attributeNodes instanceof Array) {
      const attributesLabel = this.fetchSpecOption('labels/attributes', false) as string;
      const doCoercion: boolean = R.is(Object)(this.fetchSpecOption('coercion', false));
      const matchers = this.fetchSpecOption('coercion/attributes/matchers');

      if (attributesLabel && attributesLabel !== '') {
        // Build attributes as an array identified by labels.attributes
        //
        element[attributesLabel] = R.reduce((acc: any, attrNode: any) => {
          const attributeName = attrNode['name'];
          const attributeSubject = `${subject}/[@${attributeName}]`;
          const attributeValue = doCoercion
            ? this.coerceAttributeValue(attributeSubject, matchers, attrNode['value'], attributeName)
            : attrNode['value'];

          return R.append(R.objOf(attributeName, attributeValue), acc);
        }, [])(attributeNodes);

      } else {
        // Build attributes as members.
        // Attribute nodes have name and value properties on them
        //
        const coerce = (node: any) => {
          // coercion is active
          //
          let attributePair = R.props(['name', 'value'])(node); // => [attrKey, attrValue]
          const attributeName = R.head(attributePair) as string;
          const attributeSubject = `${subject}/[@${attributeName}]`;
          const rawAttributeValue = R.last(attributePair);
          const coercedValue = this.coerceAttributeValue(attributeSubject, matchers,
            rawAttributeValue, attributeName);

          attributePair[1] = coercedValue;
          return attributePair;
        };
        const verbatim = (node: any) => {
          // proceed without coercion
          //
          return R.props(['name', 'value'])(node);
        };

        const extractPair = doCoercion ? coerce : verbatim;

        element = R.fromPairs(
          R.map(extractPair, attributeNodes) as []
        );
      }
    }

    return element;
  } // buildLocalAttributes

  /**
   * @method coerceAttributeValue
   * @description Top level function that implements value type coercion.
   * @private
   * @param {string} subject: Identifies the current xml entity
   * @param {*} matchers
   * @param {*} rawValue
   * @param {string} attributeName
   * @returns
   * @memberof XpathConverterImpl
   */
  private coerceAttributeValue (subject: string, matchers: any, rawValue: any, attributeName: string): {} {
    let resultValue = rawValue;

    if (R.is(Object)(matchers)) {
      // insertion order of keys is preserved, because key types of symbol
      // and string are iterated in insertion order. Iterative only whilst
      // we don't have a successful coercion result.
      //
      R.keys(matchers).some((mt: types.MatcherType) => {
        const transform = this.getTransformer(R.toLower(mt) as types.MatcherType);
        const result = transform.call(this, subject, rawValue, 'attributes');

        if (result.succeeded) {
          resultValue = result.value;
        }
        return result.succeeded;
      });
    } else {
      throw new e.JaxInternalError(
        `invalid matchers: ${functify(matchers)}, for attribute: ${attributeName} / raw value: ${rawValue}`,
        'coerceAttributeValue');
    }

    return resultValue;
  }

  private recurseThroughAttribute (subject: string, element: any, elementNode: Element,
    parentNode: types.NullableNode, parseInfo: types.IParseInfo, previouslySeen: string[]): {} {

    const { id, recurse = '' } = this.getElementInfo(elementNode.nodeName, parseInfo);
    const identifier = element[id] ?? '';

    if (identifier === '') {
      return element;
    }

    if (recurse !== '') {
      if (R.includes(identifier, previouslySeen)) {
        throw new e.JaxConfigError(`Circular reference detected, element '${identifier}', has already been encountered.`,
          subject);
      } else {
        previouslySeen = R.append(identifier, previouslySeen);
      }
      const { nodeName } = elementNode;

      // First get the recurse element(s), which is a csv inside @inherits.
      //
      const recurseAttr = elementNode.getAttribute(recurse) ?? '';

      // No attempt needs to be made to correctly merge inheritance chains, because the
      // inheritance chain is stripped off at the end anyway, since the concrete element
      // will have no use for it.
      //
      if (recurseAttr !== '') {
        // This is where horizontal merging occurs. IE, if this element inherits
        // from multiple commands (eg @inherits="base-command,domain-command,uni-command").
        // Usually, we'd expect that commands that are being merged horizontally, will not
        // contain clashes in properties, but that doesn't mean it can't occur. Also
        // this is where vertical merging could be required.
        //
        const recurseAttributes = R.split(',', recurseAttr);

        if (recurseAttributes.length > 1) {
          // Just need to map the at to a built element => array which we pass to merge
          //
          const inheritedElements = R.map(at => {
            // select element bode by id
            //
            const inheritedElementNode: Node = selectElementNodeById(
              nodeName, id, at, elementNode.parentNode) as Node;

            if (!inheritedElementNode) {
              throw new e.JaxConfigError(`Could not find element of type: '${nodeName}', id: '${id}'='${at}'`,
                subject);
            }

            // Horizontal recursion/merging eg: (at => base-command|domain-command|uni-command)
            //
            return this.buildElement(inheritedElementNode, parseInfo, previouslySeen);
          }, recurseAttributes);

          // Now merge one by one. On the first iteration a={} and b=first-element. This means
          // we are merging as expected, with b taking precedence over a. So the last item
          // in the list takes precedence.
          //
          const doMergeElements = (a: any, b: any) => {
            let merged;

            const descendantsLabel = this.fetchSpecOption('labels/descendants');

            if (R.includes(descendantsLabel, R.keys(a) as string[])
              && R.includes(descendantsLabel, R.keys(b) as string[])) {
              // Both a and b have children, therefore we must merge in such a way as to
              // not to lose any properties of a by calling R.mergeAll
              //
              const mergedChildren = R.concat(a[descendantsLabel], b[descendantsLabel]); // save a
              const allMergedWithoutChildrenOfA = R.mergeAll([a, b]); // This is where we lose the children of a

              // Restore the lost properties of a
              //
              const childrenLens = R.lensProp(descendantsLabel);
              merged = R.set(childrenLens, mergedChildren, allMergedWithoutChildrenOfA);
            } else {
              // There is no clash between the children of a or b, therefore we can
              // use R.mergeAll safely.
              //
              merged = R.mergeAll([a, b]);
            }

            return merged;
          };

          const mergedInheritedElements = R.reduce(doMergeElements, {}, inheritedElements);

          // Now combine with this element
          //
          const mergeList = [mergedInheritedElements, element];

          // NB: This mergeAll is safe here, because we haven't yet built the children of this
          // element yet; this will happen later and is resolved in buildChildren.
          //
          element = R.mergeAll(mergeList);
        } else {
          // Now build the singular inherited element
          //
          const inheritedElementName = recurseAttributes[0];
          const inheritedElementNode = selectElementNodeById(
            nodeName, id, inheritedElementName, elementNode.parentNode) as Node;

          if (!inheritedElementNode) {
            throw new e.JaxConfigError(
              `Could not find element of type: '${nodeName}', id: '${id}'='${inheritedElementName}'`,
                subject);
          }

          // Vertical recursion/merging to the base element
          //
          const inheritedElement = this.buildElement(inheritedElementNode, parseInfo, previouslySeen);

          // Now we need to perform a merge of this element with the inherited element
          // ensuring that any properties in this element take precedence.
          //
          element = R.mergeAll([inheritedElement, element]);
        }
      } // else recursion ends
    }

    return element;
  } // recurseThroughAttribute

  // This really should be a static, but there is no way to add a class's methods to a static
  // binding.
  //
  private makeTransformers (): void {
    this.transformers = new Map<string, ITransformFunction<any>>();
    this.transformers.set('number', this.transformNumber);
    this.transformers.set('boolean', this.transformBoolean);
    this.transformers.set('primitives', this.transformPrimitives);
    this.transformers.set('collection', this.transformCollection);
    this.transformers.set('date', this.transformDate);
    this.transformers.set('symbol', this.transformSymbol);
    this.transformers.set('string', this.transformString);
  }

  private transformers: Map<string, ITransformFunction<any>>;

  // The return type of getTransformer needs to be changed from any to a templated function
  // which returns ITransformResult<>. This is required so that call can be invoked on it.
  //
  public getTransformer (name: types.MatcherType): ITransformFunction<any> {
    const result = this.transformers.get(name);

    if (!result) {
      throw new e.JaxInternalError(`Couldn't get transformer for matcher: ${name}`,
      'getTransformer');
    }
    return result;
  }

  private transformNumber (subject: string, numberValue: number,
    context: types.ContextType): ITransformResult<number> {

    let result = Number(numberValue);

    const succeeded = !(isNaN(result));
    if (!succeeded) {
      result = numberValue;
    }

    return {
      value: result,
      succeeded: succeeded
    };
  } // transformNumber

  private transformBoolean(subject: string, booleanValue: string | boolean,
    context: types.ContextType): ITransformResult<boolean> {

    let value;
    let succeeded = false;

    if (R.is(Boolean)(booleanValue)) {
      succeeded = true;
      value = booleanValue as boolean;
    } else if (R.is(String)(booleanValue)) {
      const lowerBooleanValue = R.toLower(booleanValue as string);
      if (R.either(R.equals('true'), R.equals('false'))(lowerBooleanValue)) {
        succeeded = true;
        value = true;

        if (R.equals('false')(lowerBooleanValue)) {
          value = false;
        }
      } else {
        value = false;
      }
    } else {
      // This value is not significant and should not be used, since the transform function
      // has failed; however, we can't leave value to be unset.
      //
      value = false;
    }

    return {
      value: value,
      succeeded: succeeded
    };
  } // transformBoolean

  private transformPrimitives (subject: string, primitiveValue: types.PrimitiveType,
    context: types.ContextType): ITransformResult<any> {

    const primitives = this.fetchSpecOption(`coercion/${context}/matchers/primitives`) as [];

    if (R.includes(R.toLower(primitiveValue), ['primitives', 'collection'])) {
      throw new e.JaxConfigError(`primitives matcher cannot contain: ${primitiveValue}`,
      subject);
    }

    let coercedValue = null;
    let succeeded = false;

    primitives.some((val: types.PrimitiveType) => {
      const transform = this.getTransformer(val);
      const coercedResult = transform(subject, primitiveValue, context);
      succeeded = coercedResult.succeeded;

      if (succeeded) {
        coercedValue = coercedResult.value;
      }

      return succeeded;
    });

    return {
      succeeded: succeeded,
      value: coercedValue
    };
  } // transformPrimitives

  private transformAssoc (subject: string, assocType: any,
    context: types.ContextType, assocValue: string): ITransformResult<any> {

    let coercedValue = null;
    let succeeded = false;

    let assocTypes = assocType;

    if (R.is(String)(assocType)) {
      assocTypes = [assocType];
    }

    if (R.is(Array)(assocTypes)) {
      let self = this;
      assocTypes.some((val: types.PrimitiveType) => {
        if (R.includes(val, ['number', 'boolean', 'symbol', 'string'])) {
          const transform = self.getTransformer(val);
          const coercedResult = transform.call(self, subject, assocValue, context);

          if (coercedResult.succeeded) {
            succeeded = coercedResult.succeeded;
            coercedValue = coercedResult.value;
          }

          return coercedResult.succeeded;
        } else {
          throw new e.JaxConfigError(`Invalid value type for associative collection found: ${val}`,
            subject);
        }
      });
    } else {
      throw new e.JaxConfigError(`Invalid associative value type: ${functify(assocTypes)}`,
        subject);
    }

    return {
      succeeded: succeeded,
      value: coercedValue
    };
  } // transformAssoc

  private transformDate (subject: string, dateValue: string,
    context: types.ContextType): ITransformResult<Date> {

    const format = this.fetchSpecOption(`coercion/${context}/matchers/date/format`) as string;

    let momentDate;
    let succeeded;

    try {
      momentDate = moment(dateValue, format);
      succeeded = momentDate.isValid();
    } catch (err) {
      succeeded = false;
      momentDate = dateValue;
    }

    return {
      value: momentDate,
      succeeded: succeeded
    };
  } // transformDate

  // TODO: reconsider redesigning this ... (collectionElements depends on 't')
  //
  createTypedCollection (t: string, collectionElements: any): any {
    let collection: any;

    switch (t) {
      case 'int8array': collection = Int8Array.from(collectionElements); break;
      case 'uint8array': collection = Uint8Array.from(collectionElements); break;
      case 'uint8clampedarray': collection = Uint8ClampedArray.from(collectionElements); break;
      case 'int16array': collection = Int16Array.from(collectionElements); break;
      case 'uint16array': collection = Uint16Array.from(collectionElements); break;
      case 'int32array': collection = Int32Array.from(collectionElements); break;
      case 'uint32array': collection = Uint32Array.from(collectionElements); break;
      case 'float32array': collection = Float32Array.from(collectionElements); break;
      case 'float64array': collection = Float64Array.from(collectionElements); break;
      case 'set': collection = new Set(collectionElements); break;
      case 'weakset': collection = new WeakSet(collectionElements); break;
      case 'map': collection = new Map(collectionElements); break;
      case 'weakmap': collection = new WeakMap(collectionElements); break;

      default:
        collection = Array.from(collectionElements);
    }

    return collection;
  } // createTypedCollection

  private extractCoreCollectionValue (open: string, close: string, collectionValue: string): string {
    if (collectionValue.startsWith(open) && collectionValue.endsWith(close)) {
      const coreValue = collectionValue.replace(open, '');
      return coreValue.slice(0, coreValue.length - close.length);
    }

    return collectionValue;
  } // extractCoreCollectionValue

  private static typeExpr: RegExp;

  private extractTypeFromCollectionValue (open: string): string {
    // XML source can contain something like: !<Int8Array>[1,2,3,4]
    // to recognise sequences like "!<[]>[" or "!<Int8Array>[" which should
    // return "[]" and "Int8Array" respectively.
    //
    // NB: typeRegExp should be a member on the class, but only used by this method.
    // ideally, this would be a private internal static member of this method.
    //

    let result = '';

    if (XpathConverterImpl.typeExpr.test(open)) {

      const match = XpathConverterImpl.typeExpr.exec(open);
      const collectionType = R.view(R.lensPath(['groups', CollectionTypeLabel]))(match);

      if (collectionType) {
        result = collectionType as string;
      }
    }

    return result;
  } // extractTypeFromCollectionValue

  private transformCollection (subject: string, collectionValue: string,
    context: types.ContextType): ITransformResult<any[]> {
    let succeeded = false;
    let value: any = null;

    const delim = this.fetchSpecOption(`coercion/${context}/matchers/collection/delim`) as string;
    const open = this.fetchSpecOption(`coercion/${context}/matchers/collection/open`) as string;

    const collectionType = this.extractTypeFromCollectionValue(collectionValue);

    if (collectionType) {
      const openExpression: string = open.replace(CollectionTypePlaceHolder, ('<' + collectionType + '>'));
      const openExpr = new RegExp('^' + (escapeRegExp(openExpression)));

      const close = this.fetchSpecOption(`coercion/${context}/matchers/collection/close`) as string;
      const closeExpr = new RegExp(escapeRegExp(close) + '$');

      const openIsMatch = openExpr.test(collectionValue);
      const closeIsMatch = closeExpr.test(collectionValue);

      if (openIsMatch && closeIsMatch) {
        let temp = openExpr.exec(collectionValue);
        const capturedOpen: string = (temp) ? temp[0] : '';
        if (capturedOpen === '') {
          throw new e.JaxParseError(`open expression fails match for value '${collectionValue}'`,
            subject);
        }

        temp = closeExpr.exec(collectionValue);
        const capturedClose: string = (temp) ? temp[0] : '';
        if (capturedClose === '') {
          throw new e.JaxParseError(`close expression fails match for value '${collectionValue}'`,
            subject);
        }

        // Now look for the collection type which should be captured as '<type>'
        // So the default open pattern is: "!<[]>[", and close pattern is: "]"
        //
        // This allows values like
        // "!<[]>[1,2,3,4]" => [1,2,3,4]
        // "!<[Int8Array]>[1,2,3,4]" => [1,2,3,4]
        //
        const coreValue: string = this.extractCoreCollectionValue(capturedOpen, capturedClose, collectionValue);
        const arrayElements: any[] = coreValue.split(delim);

        return isUnaryCollection(collectionType)
          ? this.transformUnaryCollection(subject, context, arrayElements)
          : this.transformAssociativeCollection(subject, context, collectionType, arrayElements);
      }
    }

    return {
      value: value,
      succeeded: succeeded
    };
  } // transformCollection

  private transformUnaryCollection (subject: string, context: types.ContextType,
    sourceCollection: any[]): ITransformResult<any[]> {
    const value: any[] = R.map((item: types.PrimitiveType) => {
      const itemResult = this.transformPrimitives(subject, item, context);
      return (itemResult.succeeded) ? itemResult.value : item;
    })(sourceCollection);

    return {
      value: value,
      succeeded: true
    };
  } // transformUnaryCollection

  private transformAssociativeCollection (subject: string, context: types.ContextType,
    collectionType: string, sourceCollection: any[]): ITransformResult<any[]> {

    const assocDelim = this.fetchSpecOption(
      `coercion/${context}/matchers/collection/assoc/delim`) as string;

    const assocKeyType = this.fetchSpecOption(
      `coercion/${context}/matchers/collection/assoc/keyType`) as string;

    const assocValueType = this.fetchSpecOption(
      `coercion/${context}/matchers/collection/assoc/valueType`) as string;

    // Split out the values into an array of pairs
    //
    const transformValue: any[] = R.reduce((acc: any[], collectionPair: string) => {
      const elements: string[] = R.split(assocDelim)(collectionPair);
      if (elements.length === 2) {
        const coercedKeyResult = this.transformAssoc(subject, assocKeyType, context, elements[0]);
        const coercedValueResult = this.transformAssoc(subject, assocValueType, context, elements[1]);

        if (coercedKeyResult.succeeded && coercedValueResult.succeeded) {
          return R.append([coercedKeyResult.value, coercedValueResult.value])(acc);
        }
      } else {
        throw new e.JaxParseError(`Malformed map entry: ${collectionPair}`,
          subject);
      }

      return acc;
    }, [])(sourceCollection);

    let succeeded = true;
    let result: any;

    // Create the collection wrapper. We need to apply the coercion to individual
    // values here; transformAssoc ...
    //
    result = R.includes(R.toLower(collectionType), ['object', '{}'])
      ? R.fromPairs(transformValue)
      : this.createTypedCollection(R.toLower(collectionType), transformValue);

    return {
      value: result,
      succeeded: succeeded
    };
  } // transformAssociativeCollection

  /**
   * @method transformSymbol
   * @description: coerces string to a symbol.
   *
   * @param {Symbol} symbolValue
   * @param {contextType} context
   * @returns
   * @memberof XpathConverterImpl
   */
  transformSymbol (subject: string, symbolValue: string,
    context: types.ContextType): ITransformResult<Symbol> {

    const prefix = this.fetchSpecOption(
      `coercion/${context}/matchers/symbol/prefix`) as string;

    const global = this.fetchSpecOption(
      `coercion/${context}/matchers/symbol/global`) as string;

    const expr = new RegExp('^' + escapeRegExp(prefix));

    const succeeded = expr.test(symbolValue);

    return {
      value: global ? Symbol.for(symbolValue.toString()) : Symbol(symbolValue),
      succeeded: succeeded
    };
  } // transformSymbol

  /**
   * @method transformString
   * @description: Simply returns the value directly from the source. This transform
   *    can be explicitly defined to force an exception to be thrown if other defined
   *    transforms also fail. To achieve this, just define the "string" matcher in the
   *    spec with a value of false.
   *
   * @param {string} stringValue
   * @param {contextType} context
   * @returns: { value: the transformed string, succeeded: flag to indicate transform result }
   * @memberof XpathConverterImpl
   */
  transformString (subject: string, stringValue: string, context: types.ContextType)
    : ITransformResult<string> {
    const stringCoercionAcceptable = this.fetchSpecOption(
      `coercion/${context}/matchers/string`) as boolean;

    if (!stringCoercionAcceptable) {
      throw new e.JaxSolicitedError(`matching failed, terminated by string matcher.`,
        subject);
    }

    return {
      value: stringValue,
      succeeded: true
    };
  } // transformString

  /**
   * @method buildChildren
   *
   * @param {*} element: The native object being built that represents "elementNode"
   * @param {*} elementNode: The XML node being built into JSON
   * @param {types.IParseInfo} parseInfo: Element parsing info
   * @param {string[]} previouslySeen: Used internally to guard against circular references.
   * @returns {*}: The JSON representing the elementNode
   *
   * @memberof XpathConverterImpl
   */
  buildChildren (subject: string, element: any, elementNode: Node, parseInfo: types.IParseInfo,
    previouslySeen: string[]): {} {
    const selectionResult: any = xpath.select('./*', elementNode);

    const descendantsLabel = this.fetchSpecOption(`labels/descendants`) as string;

    if (selectionResult && selectionResult.length > 0) {
      const getElementsFn: any = R.filter((child: any) => (child.nodeType === child.ELEMENT_NODE));
      const elements: any = getElementsFn(selectionResult);

      const children: any = R.reduce((acc, childElement: Element): any => {
        const child = this.buildElement(childElement, parseInfo, previouslySeen);
        return R.append(child, acc);
      }, [])(elements);

      if (R.includes(descendantsLabel, R.keys(element) as string[])) {
        const merged = R.concat(children, element[descendantsLabel]);
        element[descendantsLabel] = merged;
      } else {
        element[descendantsLabel] = children;
      }

      const elementLabel = this.fetchSpecOption(`labels/element`) as string;
      const elementInfo: types.IElementInfo = this.getElementInfo(
        element[elementLabel], parseInfo);

      if (R.hasPath(['descendants', 'by'], elementInfo)) {
        const descendants = element[descendantsLabel];

        if (R.all(R.has(elementInfo.id))(children)) {
          if (R.pathEq(['descendants', 'by'], 'index', elementInfo)) {
            if (elementInfo?.descendants?.throwIfMissing) {
              // We need a new version of ramda's indexBy function that can take an extra
              // parameter being a function which is invoked to handle duplicate keys. In
              // its absence, we can find duplicates via a reduce ...
              //
              R.reduce((acc: any, val: any) => {
                if (R.includes(val[elementInfo.id], acc)) { // TODO: contains -> includes; please check
                  throw new e.JaxSolicitedError(`Element collision found: ${functify(val)}`,
                  subject);
                }
                return R.append(val[elementInfo.id], acc);
              }, [])(descendants);
            }

            element[descendantsLabel] = R.indexBy(R.prop(elementInfo.id),
              descendants);
          } else if (R.pathEq(['descendants', 'by'], 'group', elementInfo)) {
            element[descendantsLabel] = R.groupBy(R.prop(elementInfo.id),
              descendants);
          }
        } else if (elementInfo?.descendants?.throwIfMissing) {
          // TODO: check this (not replaced by complement)
          //
          const missing: any = R.find(
            R.complement(R.has(elementInfo.id))
          )(children) ?? {};
          throw new e.JaxSolicitedError(
            `Element is missing key attribute "${elementInfo.id}": (${functify(missing)})`,
              subject);
        }
      }
    }

    let elementText: string = this.composeText(elementNode);

    if (elementText && elementText !== '') {
      const textLabel = this.fetchSpecOption(`labels/text`) as string;
      element[textLabel] = elementText;
    }

    return element;
  } // buildChildren

  /**
   * @method getElementInfo
   *
   * @private
   * @param {string} elementName
   * @param {types.IParseInfo} parseInfo
   * @returns {types.IElementInfo}
   * @memberof XpathConverterImpl
   */
  private getElementInfo (elementName: string, parseInfo: types.IParseInfo): types.IElementInfo {
    return parseInfo.elements.get(elementName) ?? parseInfo.def ?? types.EmptyElementInfo;
  }

  /**
   * @method composeText
   * @description: The text of an XML element can be accessed only by using .firstChild and
   *    .nextSibling. Both raw text (appearing inside the opening and closing element tags)
   *    and CDATA text are supported. Unfortunately, comment text is also read in. Comment
   *    text is not going to cause problems, because the comment text doesn't appear in any
   *    location. Every element has the potential to have text on it so it has to be invoked
   *    for every element processed. NB: It is not possible to select all the Text nodes from an
   *    element based upon the nodeType.
   *
   * @param {XMLNode} elementNode: The XML node being built
   * @returns {String} The text collected from the immediate children of the elementNode being
   *    built.
   */
  public composeText (elementNode: any): string {
    let text = '';
    let currentChild = elementNode.firstChild;
    const doTrim = this.fetchSpecOption('coercion/textNodes/trim') as boolean;

    while (currentChild !== null) {
      if (currentChild.data && currentChild.data !== null) {
        text = doTrim ? R.concat(text, currentChild.data.trim()) : R.concat(text, currentChild.data);
      }
      currentChild = currentChild.nextSibling;
    }

    return text;
  } // composeText

  /**
   * @method fetchSpecOption
   * @description Fetches the option denoted by the path. If the option requested does
   * not appear in spec the provided, the option will be fetched from the fallBack
   * spec (with caveats see fallBack parameter). The path specified must be treated
   * as absolute and relates to the base spec.
   *
   * @private
   * @param {string} path delimited string containing the segments used to build a lens
   * for inspecting the spec.
   * @param {boolean} [fallBack=true] The setting of this value depends from where it is
   * being called as well as the item being requested. Eg, labels.attribute is an optional
   * and its presence acts like a flag. For items with flag like behaviour, then it is
   * ok to set fallBack to false, as we should return nothing in this scenario instead of
   * looking into the fallBack spec. Also, if called from a transform function and a value
   * is being retrieved from under ./coercion, then its ok allow fallBack = true, because
   * all transform functions are activated as a result of coercion being active.
   *
   * @returns {*}
   * @memberof XpathConverterImpl
   */
  public fetchSpecOption (path: string, fallBack: boolean = true): any {
    const segments: string[] = R.split('/')(path);
    const itemLens: R.Lens = R.lensPath(segments);

    const result = fallBack
      ? R.defaultTo(R.view(itemLens)(Specs.fallBack), R.view(itemLens)(this.spec))
      : R.view(itemLens)(this.spec);

    return result;
  }
} // class XpathConverterImpl

XpathConverterImpl.initialise();

/**
 * @function: escapeRegExp
 * @description:
 * @see: https: //developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#Escaping
 * @param {String} inputString: input to escape.
 * @returns: escaped String.
 */
function escapeRegExp (inputString: string): string {
  return inputString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

function selectElementNodeById (elementName: string, id: string, name: string,
  rootNode: (Node & ParentNode) | null): types.NullableNode {
  // Typescript warning:
  //
  // WARN: This function makes the assumption that if you're selecting an element by an identifier,
  // then that identifier is unique and so is the element which also means that it should only
  // ever return a single item or nothing. If the following select statement is missing the true
  // flag to indicate that only a single item should be returned, then the select will return the
  // single item inside an array, which is compatible with it's declared return signature:
  // xpath/api.d.ts:
  // * declare function select(e: string, doc?: Node, single?: boolean): string | number | boolean | Node | Node[];
  //
  // The problem however is this: 'selectElementNodeById' has declared it's return type to be
  // Node | null (types.NullableNode). There is no scope for a Node[], so how does this get pass the
  // TS type-checker? How is Node[] assignable to Node or null? Given all the other problems I have
  // found when declaring the correct types, how is it that this particular example is not flagged as
  // an error?
  //

  if (rootNode && rootNode instanceof Node) {
    const result: types.SelectResult = xpath.select(`.//${elementName}[@${id}="${name}"]`, rootNode, true);

    return result instanceof Node ? result : null;
  }
  return null;
}

function isUnaryCollection (definedType: string): boolean {
  return R.includes(R.toLower(definedType), ['[]', 'int8array', 'uint8array', 'uint8clampedarray', 'int16array',
    'int16array', 'int32array', 'uint32array', 'float32array', 'float64array', 'set']);
}

export function composeElementPath (node: types.NullableNode): string {
  if (!node) {
    return '/';
  } else if (node instanceof Document) {
    return '';
  } else {
    return `${composeElementPath(node.parentNode)}/${node.nodeName}`;
  }
}
