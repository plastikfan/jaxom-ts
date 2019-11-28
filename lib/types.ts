
// Element Parse Info
//
export interface IElementInfo {
  readonly id?: string;
  readonly recurse?: string;
  readonly discards?: ReadonlyArray<string>;
  readonly descendants?: {
    readonly by?: string;
    readonly throwIfCollision?: boolean;
    readonly throwIfMissing?: boolean;
  };
}

export interface IParseInfo {
  readonly elements: ReadonlyMap<string, IElementInfo>;
  readonly common?: IElementInfo;
  readonly def?: IElementInfo;
}

// Spec
//

interface IAssociativeCollection { // {DEF}
  delim?: string;
  keyType?: string;
  valueType?: string;
}

interface ITextNodeCollection { // {DEF}
  assoc?: IAssociativeCollection;
}

interface IAttributeNodeCollection { // {DEF}
  delim?: string;
  open?: string;
  close?: string;
  assoc?: IAssociativeCollection;
}

export type ContextType = 'attributes' | 'textNodes';
export type MatcherType = 'number' | 'boolean' | 'primitives' | 'collection' | 'date' | 'symbol' | 'string';
export type PrimitiveType = 'number' | 'boolean';

interface IMatchers { // {DEF}
  primitives?: ReadonlyArray<PrimitiveType>;
  // collection
  date?: {
    format?: string
  };
  symbol?: {
    prefix?: string,
    global?: boolean
  };
  string?: boolean;
}

interface IAttributesMatchers extends IMatchers {
  collection?: IAttributeNodeCollection;
}

interface ITextNodesMatchers extends IMatchers {
  collection?: ITextNodeCollection;
}
interface ICoercionEntity<T extends IMatchers> {
  trim?: boolean;
  matchers?: T;
}

export interface ISpec {
  name: string;
  labels?: { // {DEF}
    attributes?: string; // NOT DEFAULT-ABLE
    element?: string;
    descendants?: string;
    text?: string;
  };
  attributes?: {
    trim?: boolean;
    coercion?: ICoercionEntity<IAttributesMatchers>
  };
  textNodes?: {
    trim?: boolean;
    coercion?: ICoercionEntity<ITextNodesMatchers>
  };
  coercion?: { // NOT DEFAULT-ABLE. If not present, then coercion is turned off, so don't use defaults.
    attributes?: ICoercionEntity<IAttributesMatchers>,
    textNodes?: ICoercionEntity<ITextNodesMatchers>
  };
}

export type SelectResult = string | number | boolean | Node | Node[];
export type SelectNodeResult = Node | Node[];
export type NullableNode = Node | null;
export interface IConverter {
  build (elementNode: Node, parseInfo: IParseInfo): any;
}

export interface IConverterImpl {
  build (elementNode: Node, parseInfo: IParseInfo, previouslySeen: string[]): any;
  buildElement (elementNode: Node, parseInfo: IParseInfo, previouslySeen: string[]): any;
}

export interface INormaliser {
  combineDescendants (subject: string, parent: {}): {};
}

export interface ITransformer {
  coerceAttributeValue (subject: string, matchers: any, rawValue: any, attributeName: string): {};
}

export interface ISpecService {
  fetchOption (path: string, fallBack?: boolean): any;
  getSpec (): ISpec;
}