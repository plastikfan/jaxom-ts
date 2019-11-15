
import { expect, assert, use } from 'chai';
import dirtyChai from 'dirty-chai';
use(dirtyChai);
import * as R from 'ramda';
import * as xp from 'xpath-ts';
import 'xmldom-ts';
const parser = new DOMParser();
const { functify } = require('jinxed');
import * as types from '../../lib/converter/types';
import * as Helpers from '../test-helpers';
import { XpathConverter as Jaxom } from '../../lib/converter/xpath-converter.class';

const testParseInfo: types.IParseInfo = {
  elements: new Map<string, types.IElementInfo>([
    ['Command', {
      id: 'name',
      recurse: 'inherits',
      discards: ['inherits', 'abstract'],
      descendants: {
        by: 'index',
        throwIfCollision: false,
        throwIfMissing: false
      }
    }]
  ])
};

describe('xpath-converter.buildElement', () => {
  context('given: new object / command with no inheritance, using default spec', () => {
    it('should: return a command object all local attributes', () => {
      const data = `<?xml version="1.0"?>
        <Application name="pez">
          <Cli>
            <Commands>
              <Command name="leaf" describe="this is a leaf command" type="native"/>
            </Commands>
          </Cli>
        </Application>`;

      const document: Document = parser.parseFromString(data, 'text/xml');
      const commandsNode = xp.select('/Application/Cli/Commands', document, true);

      if (commandsNode && commandsNode instanceof Node) {
        let leafCommandNode: types.NullableNode = Helpers.selectElementNodeById(
          'Command', 'name', 'leaf', commandsNode);

        if (leafCommandNode) {
          const converter = new Jaxom();
          let command: {} = converter.buildElement(leafCommandNode, testParseInfo);

          let result = Helpers.logIfFailedStringify(R.where({
            'name': R.equals('leaf'),
            'describe': R.equals('this is a leaf command'),
            'type': R.equals('native')
          })(command), command);

          expect(result).to.be.true(functify(command));
        } else {
          assert.fail('Couldn\'t get Command node.');
        }
      } else {
        assert.fail('Couldn\'t get Commands node.');
      }
    });
  });

  context('given: Command with no inheritance', () => {
    it('should: return a command object all local attributes', () => {
      const data = `<?xml version="1.0"?>
        <Application name="pez">
          <Cli>
            <Commands>
              <Command name="base-command" abstract="true"/>
              <Command name="mid-command" inherits="base-command" type="native"/>
              <Command name="leaf" inherits="mid-command" describe="this is a leaf command"/>
            </Commands>
          </Cli>
        </Application>`;

      const document: Document = parser.parseFromString(data, 'text/xml');
      const commandsNode = xp.select('/Application/Cli/Commands', document, true);

      if (commandsNode && commandsNode instanceof Node) {
        const converter = new Jaxom();
        let leafCommandNode: types.NullableNode = Helpers.selectElementNodeById(
          'Command', 'name', 'leaf', commandsNode);

        if (leafCommandNode) {
          let command: {} = converter.buildElement(leafCommandNode, testParseInfo);

          let result = Helpers.logIfFailedStringify(R.where({
            'name': R.equals('leaf'),
            'describe': R.equals('this is a leaf command'),
            'type': R.equals('native')
          })(command), command);

          expect(result).to.be.true(functify(command));
        } else {
          assert.fail('Couldn\'t get Command node.');
        }
      } else {
        assert.fail('Couldn\'t get Commands node.');
      }
    });
  });

  context('given: a command inherits from itself', () => {
    it('should: throw', () => {
      const data = `<?xml version="1.0"?>
        <Application name="pez">
          <Cli>
            <Commands>
              <Command name="leaf" describe="this is a leaf command" inherits="leaf"/>
            </Commands>
          </Cli>
        </Application>`;

      const document: Document = parser.parseFromString(data, 'text/xml');
      const commandsNode: types.SelectResult = xp.select(
        '/Application/Cli/Commands', document, true);

      if (commandsNode && commandsNode instanceof Node) {
        const converter = new Jaxom();
        const invalidCommandNode: types.NullableNode = Helpers.selectElementNodeById(
          'Command', 'name', 'leaf', commandsNode);

        if (invalidCommandNode) {
          expect(() => {
            converter.buildElement(invalidCommandNode, testParseInfo);
          }).to.throw(Error);
        } else {
          assert.fail('FAILURE! Couldn\'t get Command node.');
        }
      } else {
        assert.fail('FAILURE! Couldn\'t get Commands node.');
      }
    });
  });

  context('given: Expression with no inheritance', () => {
    it('should: return an expression object all local attributes', () => {
      const data = `<?xml version="1.0"?>
        <Application name="pez">
          <Expressions>
            <Expression name="person's-name-expression" eg="Mick Mars">
              <Pattern><![CDATA[[a-zA-Z\s']+]]></Pattern>
            </Expression>
          </Expressions>
        </Application>`;

      const document: Document = parser.parseFromString(data, 'text/xml');
      const expressionsNode: types.SelectResult = xp.select(
        '/Application/Expressions', document, true);

      if (expressionsNode && expressionsNode instanceof Node) {
        const converter = new Jaxom();
        let expressionNode: types.NullableNode = Helpers.selectElementNodeById(
          'Expression', 'name', 'person\'s-name-expression', expressionsNode);

        if (expressionNode) {
          let element: {} = converter.buildElement(expressionNode, {
            elements: new Map<string, types.IElementInfo>([
              ['Expression', {
                id: 'name',
                descendants: {
                  by: 'index',
                  throwIfCollision: false,
                  throwIfMissing: false
                }
              }]
            ])
          });

          let result = Helpers.logIfFailedStringify(R.where({
            'name': R.equals(`person's-name-expression`),
            'eg': R.equals('Mick Mars')
          })(element), element);

          expect(result).to.be.true(functify(element));
        } else {
          assert.fail('Couldn\'t get Expression node.');
        }
      } else {
        assert.fail('Couldn\'t get Expressions node.');
      }
    });
  });

  context('given: Source with no inheritance', () => {
    it('should: return a source object all local attributes', () => {
      const data = `<?xml version="1.0"?>
        <Application name="pez">
          <Sources>
            <Source name="some-json-source" provider="json-provider">
              <Path fullpath="/path/to/json/file.txt"/>
            </Source>
          </Sources>
        </Application>`;

      const document: Document = parser.parseFromString(data, 'text/xml');
      const sourcesNode: types.SelectResult = xp.select(
        '/Application/Sources', document, true);

      if (sourcesNode && sourcesNode instanceof Node) {
        const converter = new Jaxom();
        let sourceNode: types.NullableNode = Helpers.selectElementNodeById(
          'Source', 'name', 'some-json-source', sourcesNode);

        if (sourceNode) {
          let source: {} = converter.buildElement(sourceNode, {
            elements: new Map<string, types.IElementInfo>([
              ['Source', {
                id: 'name',
                descendants: {
                  by: 'index',
                  throwIfCollision: false,
                  throwIfMissing: false
                }
              }]
            ])
          });

          let result = Helpers.logIfFailedStringify(R.where({
            'name': R.equals('some-json-source'),
            'provider': R.equals('json-provider')
          })(source), source);

          expect(result).to.be.true(functify(source));
        } else {
          assert.fail('Couldn\'t get Source node.');
        }
      } else {
        assert.fail('Couldn\'t get Sources node.');
      }
    });
  });

  context('given: Argument with no inheritance', () => {
    it('should: return an argument object all local attributes', () => {
      const data = `<?xml version="1.0"?>
        <Application name="pez">
          <Cli>
            <Arguments>
              <Argument name="filesys" alias="fs" optional="true"
                describe="The file system as defined in config as FileSystem">
              </Argument>
            </Arguments>
          </Cli>
        </Application>`;

      const document: Document = parser.parseFromString(data, 'text/xml');
      const argumentsNode: types.SelectResult = xp.select(
        '/Application/Cli/Arguments', document, true);

      if (argumentsNode && argumentsNode instanceof Node) {
        const converter = new Jaxom();
        let argumentNode: types.NullableNode = Helpers.selectElementNodeById(
          'Argument', 'name', 'filesys', argumentsNode);

        if (argumentNode) {
          let source: {} = converter.buildElement(argumentNode, {
            elements: new Map<string, types.IElementInfo>([
              ['Source', {
                id: 'name',
                descendants: {
                  by: 'index',
                  throwIfCollision: false,
                  throwIfMissing: false
                }
              }]
            ])
          });

          let result = Helpers.logIfFailedStringify(R.where({
            'name': R.equals('filesys'),
            'alias': R.equals('fs'),
            'optional': R.equals(true)
          })(source), source);

          expect(result).to.be.true(functify(source));
        } else {
          assert.fail('Couldn\'t get Argument node.');
        }
      } else {
        assert.fail('Couldn\'t get Arguments node.');
      }
    });
  });

  context('given: Tree with no inheritance', () => {
    it('should: return an tree object all local attributes', () => {
      const data = `<?xml version="1.0"?>
        <Application name="pez">
          <FileSystems>
            <FileSystem name="staging" default="true">
              <Trees>
                <Tree root="/Volumes/Epsilon/Skipa" alias="skipa"/>
              </Trees>
            </FileSystem>
          </FileSystems>
        </Application>`;

      const document: Document = parser.parseFromString(data, 'text/xml');
      const treesNode: types.SelectResult = xp.select(
        '/Application/FileSystems/FileSystem[@name="staging"]/Trees', document, true);

      if (treesNode && treesNode instanceof Node) {
        const converter = new Jaxom();
        let treeNode: types.NullableNode = Helpers.selectElementNodeById(
          'Tree', 'alias', 'skipa', treesNode);

        if (treeNode) {
          let tree: {} = converter.buildElement(treeNode, {
            elements: new Map<string, types.IElementInfo>([
              ['Tree', {
                id: 'alias',
                descendants: {
                  by: 'index',
                  throwIfCollision: false,
                  throwIfMissing: false
                }
              }]
            ])
          });

          let result = Helpers.logIfFailedStringify(R.where({
            'alias': R.equals('skipa'),
            'root': R.equals('/Volumes/Epsilon/Skipa')
          })(tree), tree);

          expect(result).to.be.true(functify(tree));
        } else {
          assert.fail('Couldn\'t get Tree node.');
        }
      } else {
        assert.fail('Couldn\'t get Trees node.');
      }
    });
  });

  context('Additional inheritance Command tests', () => {
    context('given: command with single line of inheritance (3 commands, no args)', () => {
      it('should: return a command object all inherited attributes', () => {
        const data = `<?xml version="1.0"?>
          <Application name="pez">
            <Cli>
              <Commands>
                <Command name="base-command" abstract="true"/>
                <Command name="mid-command" inherits="base-command" type="native"/>
                <Command name="leaf" inherits="mid-command" describe="this is a leaf command"/>
              </Commands>
            </Cli>
          </Application>`;

        const document: Document = parser.parseFromString(data, 'text/xml');
        const commandsNode: types.SelectResult = xp.select(
          '/Application/Cli/Commands', document, true);

        if (commandsNode && commandsNode instanceof Node) {
          const converter = new Jaxom();
          let leafCommandNode: types.NullableNode = Helpers.selectElementNodeById(
            'Command', 'name', 'leaf', commandsNode);

          if (leafCommandNode) {
            let command: {} = converter.buildElement(leafCommandNode, testParseInfo);

            let result = Helpers.logIfFailedStringify(R.where({
              'name': R.equals('leaf'),
              'describe': R.equals('this is a leaf command'),
              'type': R.equals('native')
            })(command), command);

            expect(result).to.be.true(functify(command));
          } else {
            assert.fail('Couldn\'t get Command node.');
          }
        } else {
          assert.fail('Couldn\'t get Commands node.');
        }
      });
    });

    context('given: command with single line of inheritance (3 commands, no args)', () => {
      it('should: return a command object all inherited attributes', () => {
        const data = `<?xml version="1.0"?>
          <Application name="pez">
            <Cli>
              <Commands>
                <Command name="base-command" abstract="true"/>
                <Command name="mid-command" inherits="base-command" type="native"/>
                <Command name="leaf" inherits="mid-command" describe="this is a leaf command"/>
              </Commands>
            </Cli>
          </Application>`;

        const document: Document = parser.parseFromString(data, 'text/xml');
        const commandsNode: types.SelectResult = xp.select(
          '/Application/Cli/Commands', document, true);

        if (commandsNode && commandsNode instanceof Node) {
          const converter = new Jaxom();
          const leafCommandNode: types.NullableNode = Helpers.selectElementNodeById(
            'Command', 'name', 'leaf', commandsNode);

          if (leafCommandNode) {
            const command: {} = converter.buildElement(leafCommandNode, testParseInfo);

            const result = Helpers.logIfFailedStringify(R.where({
              'name': R.equals('leaf'),
              'describe': R.equals('this is a leaf command'),
              'type': R.equals('native')
            })(command), command);

            expect(result).to.be.true(functify(command));
          } else {
            assert.fail('Couldn\'t get Command node.');
          }
        } else {
          assert.fail('Couldn\'t get Commands node.');
        }
      });
    });

    context('given: command with single line of inheritance (3 commands, no args)', () => {
      it('should: return a command object all inherited attributes where mid command overrides base', () => {
        const data = `<?xml version="1.0"?>
          <Application name="pez">
            <Cli>
              <Commands>
                <Command name="base-command" abstract="true" filter="alpha"/>
                <Command name="mid-command" inherits="base-command" type="native" filter="beta"/>
                <Command name="leaf" inherits="mid-command" describe="this is a leaf command"/>
              </Commands>
            </Cli>
          </Application>`;

        const document: Document = parser.parseFromString(data, 'text/xml');
        const commandsNode: types.SelectResult = xp.select(
          '/Application/Cli/Commands', document, true);

        if (commandsNode && commandsNode instanceof Node) {
          const converter = new Jaxom();
          let leafCommandNode: types.NullableNode = Helpers.selectElementNodeById(
            'Command', 'name', 'leaf', commandsNode);

          if (leafCommandNode) {
            let command: {} = converter.buildElement(leafCommandNode, testParseInfo);

            let result = Helpers.logIfFailedStringify(R.where({
              'name': R.equals('leaf'),
              'describe': R.equals('this is a leaf command'),
              'type': R.equals('native'),
              'filter': R.equals('beta')
            })(command), command);

            expect(result).to.be.true(functify(command));
          } else {
            assert.fail('Couldn\'t get Command node.');
          }
        } else {
          assert.fail('Couldn\'t get Commands node.');
        }
      });
    });
  });

  context('given: command with single line of inheritance (3 commands, no args)', () => {
    it('should: return a command object all inherited attributes where leaf command overrides base', () => {
      const data = `<?xml version="1.0"?>
        <Application name="pez">
          <Cli>
            <Commands>
              <Command name="base-command" abstract="true" filter="alpha"/>
              <Command name="mid-command" inherits="base-command" type="native"/>
              <Command name="leaf" inherits="mid-command" describe="this is a leaf command" filter="beta"/>
            </Commands>
          </Cli>
        </Application>`;

      const document: Document = parser.parseFromString(data, 'text/xml');
      const commandsNode: types.SelectResult = xp.select('/Application/Cli/Commands', document, true);

      if (commandsNode && commandsNode instanceof Node) {
        const converter = new Jaxom();
        let leafCommandNode: types.NullableNode = Helpers.selectElementNodeById(
          'Command', 'name', 'leaf', commandsNode);

        if (leafCommandNode) {
          let command: {} = converter.buildElement(leafCommandNode, testParseInfo);

          let result = Helpers.logIfFailedStringify(R.where({
            'name': R.equals('leaf'),
            'describe': R.equals('this is a leaf command'),
            'type': R.equals('native'),
            'filter': R.equals('beta')
          })(command), command);

          expect(result).to.be.true(functify(command));
        } else {
          assert.fail('Couldn\'t get Command node.');
        }
      } else {
        assert.fail('Couldn\'t get Commands node.');
      }
    });
  });

  context('given: command with 3-way multi inheritance (3 commands, no args)', () => {
    it('should: return a command object all inherited attributes from 3 base commands', () => {
      const data = `<?xml version="1.0"?>
        <Application name="pez">
          <Cli>
            <Commands>
              <Command name="alpha-command" abstract="true" filter="alpha"/>
              <Command name="beta-command" type="native"/>
              <Command name="gamma-command" theme="concept"/>
              <Command name="leaf" inherits="alpha-command,beta-command,gamma-command"
                describe="this is a leaf command" album="powerslave"/>
            </Commands>
          </Cli>
        </Application>`;

      const document: Document = parser.parseFromString(data, 'text/xml');
      const commandsNode: types.SelectResult = xp.select(
        '/Application/Cli/Commands', document, true);

      if (commandsNode && commandsNode instanceof Node) {
        const converter = new Jaxom();
        let leafCommandNode: types.NullableNode = Helpers.selectElementNodeById(
          'Command', 'name', 'leaf', commandsNode);

        if (leafCommandNode) {
          let command: {} = converter.buildElement(leafCommandNode, testParseInfo);

          let result = Helpers.logIfFailedStringify(R.where({
            'name': R.equals('leaf'),
            'describe': R.equals('this is a leaf command'),
            'album': R.equals('powerslave'),
            'filter': R.equals('alpha'),
            'type': R.equals('native'),
            'theme': R.equals('concept')
          })(command), command);

          expect(result).to.be.true(functify(command));
        } else {
          assert.fail('Couldn\'t get Command node.');
        }
      } else {
        assert.fail('Couldn\'t get Commands node.');
      }
    });

    it('should: return a command object all inherited and overridden attributes from 3 base commands', () => {
      const data = `<?xml version="1.0"?>
        <Application name="pez">
          <Cli>
            <Commands>
              <Command name="alpha-command" abstract="true" filter="alpha-filter"/>
              <Command name="beta-command" filter="beta-filter"/>
              <Command name="gamma-command" filter="gamma-filter"/>
              <Command name="leaf" inherits="alpha-command,beta-command,gamma-command"
                describe="this is a leaf command" filter="leaf-filter"/>
            </Commands>
          </Cli>
        </Application>`;

      const document: Document = parser.parseFromString(data, 'text/xml');
      const commandsNode: types.SelectResult = xp.select(
        '/Application/Cli/Commands', document, true);

      if (commandsNode && commandsNode instanceof Node) {
        const converter = new Jaxom();
        let leafCommandNode: types.NullableNode = Helpers.selectElementNodeById(
          'Command', 'name', 'leaf', commandsNode);

        if (leafCommandNode) {
          let command: {} = converter.buildElement(leafCommandNode, testParseInfo);

          let result = Helpers.logIfFailedStringify(R.where({
            'name': R.equals('leaf'),
            'describe': R.equals('this is a leaf command'),
            'filter': R.equals('leaf-filter')
          })(command), command);

          expect(result).to.be.true(functify(command));

        } else {
          assert.fail('Couldn\'t get Command node.');
        }
      } else {
        assert.fail('Couldn\'t get Commands node.');
      }
    });
  });

  context('given: command with dual inheritance (2+1 commands, no args)', () => {
    it('should: return a command object all inherited attributes from 2 base commands', () => {
      const data = `<?xml version="1.0"?>
        <Application name="pez">
          <Cli>
            <Commands>
              <Command name="alpha-command" abstract="true" filter="alpha"/>
              <Command name="beta-command" inherits="alpha-command" type="native"/>
              <Command name="gamma-command" theme="concept"/>
              <Command name="leaf" inherits="beta-command,gamma-command"
                describe="this is a leaf command" album="powerslave"/>
            </Commands>
          </Cli>
        </Application>`;

      const document: Document = parser.parseFromString(data, 'text/xml');
      const commandsNode: types.SelectResult = xp.select('/Application/Cli/Commands', document, true);

      if (commandsNode && commandsNode instanceof Node) {
        const converter = new Jaxom();
        let leafCommandNode: types.NullableNode = Helpers.selectElementNodeById(
          'Command', 'name', 'leaf', commandsNode);

        if (leafCommandNode) {
          let command: {} = converter.buildElement(leafCommandNode, testParseInfo);

          let result = Helpers.logIfFailedStringify(R.where({
            'name': R.equals('leaf'),
            'describe': R.equals('this is a leaf command'),
            'album': R.equals('powerslave'),
            'filter': R.equals('alpha'),
            'type': R.equals('native'),
            'theme': R.equals('concept')
          })(command), command);

          expect(result).to.be.true(functify(command));
        } else {
          assert.fail('Couldn\'t get Command node.');
        }
      } else {
        assert.fail('Couldn\'t get Commands node.');
      }
    });
  });

  context('given: command with dual inheritance (2+1 commands, no args)', () => {
    it('return a command object all inherited attributes from 2 base commands', () => {
      const data = `<?xml version="1.0"?>
        <Application name="pez">
          <Cli>
            <Commands>
              <Command name="alpha-command" abstract="true" filter="alpha"/>
              <Command name="beta-command" inherits="alpha-command" type="native"/>
              <Command name="gamma-command" theme="concept"/>
              <Command name="leaf" inherits="beta-command,gamma-command"
                describe="this is a leaf command" album="powerslave"/>
            </Commands>
          </Cli>
        </Application>`;

      const document: Document = parser.parseFromString(data, 'text/xml');
      const commandsNode: types.SelectResult = xp.select(
        '/Application/Cli/Commands', document, true);

      if (commandsNode && commandsNode instanceof Node) {
        const converter = new Jaxom();
        let leafCommandNode: types.NullableNode = Helpers.selectElementNodeById(
          'Command', 'name', 'leaf', commandsNode);

        if (leafCommandNode) {
          let command: {} = converter.buildElement(leafCommandNode, testParseInfo);

          let result = Helpers.logIfFailedStringify(R.where({
            'name': R.equals('leaf'),
            'describe': R.equals('this is a leaf command'),
            'album': R.equals('powerslave'),
            'filter': R.equals('alpha'),
            'type': R.equals('native'),
            'theme': R.equals('concept')
          })(command), command);

          expect(result).to.be.true(functify(command));
        } else {
          assert.fail('Couldn\'t get Command node.');
        }
      } else {
        assert.fail('Couldn\'t get Commands node.');
      }
    });
  });

  context('given: command with dual inheritance (1+1 commands, no args)', () => {
    it('should: return a command object all inherited attributes where right-most command take precedence', () => {
      const data = `<?xml version="1.0"?>
        <Application name="pez">
          <Cli>
            <Commands>
              <Command name="alpha-command" filter="alpha-filter" mode="auto"/>
              <Command name="beta-command" filter="beta-filter"/>
              <Command name="leaf" inherits="alpha-command,beta-command"
                describe="this is a leaf command"/>
            </Commands>
          </Cli>
        </Application>`;

      const document: Document = parser.parseFromString(data, 'text/xml');
      const commandsNode = xp.select('/Application/Cli/Commands', document, true);

      if (commandsNode && commandsNode instanceof Node) {
        const converter = new Jaxom();
        const leafCommandNode: types.NullableNode = Helpers.selectElementNodeById(
          'Command', 'name', 'leaf', commandsNode);

        if (leafCommandNode) {
          const command: {} = converter.buildElement(leafCommandNode, testParseInfo);

          const result = Helpers.logIfFailedStringify(R.where({
            'name': R.equals('leaf'),
            'describe': R.equals('this is a leaf command'),
            'filter': R.equals('beta-filter'),
            'mode': R.equals('auto')
          })(command), command);

          expect(result).to.be.true(functify(command));
        } else {
          assert.fail('Couldn\'t get Command node.');
        }
      } else {
        assert.fail('Couldn\'t get Commands node.');
      }
    });
  });

  context('given: circular command references detected', () => {
    it('should: throw', () => {
      const data = `<?xml version="1.0"?>
        <Application name="pez">
          <Cli>
            <Commands>
              <Command name="alpha-command" inherits="beta-command"/>
              <Command name="beta-command" inherits="alpha-command"/>
              <Command name="leaf" inherits="beta-command"
                describe="this is a leaf command"/>
            </Commands>
          </Cli>
        </Application>`;

      const document: Document = parser.parseFromString(data, 'text/xml');
      const commandsNode: types.SelectResult = xp.select(
        '/Application/Cli/Commands', document, true);

      if (commandsNode && commandsNode instanceof Node) {
        const converter = new Jaxom();
        const leafCommandNode: types.NullableNode = Helpers.selectElementNodeById(
          'Command', 'name', 'leaf', commandsNode);

        if (leafCommandNode) {
          expect(() => {
            converter.buildElement(leafCommandNode, testParseInfo);
          }).to.throw(Error);
        } else {
          assert.fail('FAILURE! Couldn\'t get Command node.');
        }
      } else {
        assert.fail('FAILURE! Couldn\'t get Commands node.');
      }
    });
  });

  context('given: command inherits from itself', () => {
    it('should: throw', () => {
      const data = `<?xml version="1.0"?>
        <Application name="pez">
          <Cli>
            <Commands>
              <Command name="leaf" inherits="leaf"
                describe="this is a leaf command"/>
            </Commands>
          </Cli>
        </Application>`;

      const document: Document = parser.parseFromString(data, 'text/xml');
      const commandsNode: types.SelectResult = xp.select(
        '/Application/Cli/Commands', document, true);

      if (commandsNode && commandsNode instanceof Node) {
        const converter = new Jaxom();
        const leafCommandNode: types.NullableNode = Helpers.selectElementNodeById(
          'Command', 'name', 'leaf', commandsNode);

        if (leafCommandNode) {
          expect(() => {
            converter.buildElement(leafCommandNode, testParseInfo);
          }).to.throw(Error);
        } else {
          assert.fail('FAILURE! Couldn\'t get Command node.');
        }

      } else {
        assert.fail('FAILURE! Couldn\'t get Commands node.');
      }
    });
  });

  context('given: command with single inheritance and local & inherited arguments and groups', () => {
    const data = `<?xml version="1.0"?>
      <Application name="pez">
        <Cli>
          <Commands>
            <Command name="duo-command" abstract="true">
              <Arguments>
                <ArgumentRef name="from"/>
                <ArgumentRef name="to"/>
              </Arguments>
              <ArgumentGroups>
                <Implies>
                  <ArgumentRef name="from"/>
                  <ArgumentRef name="to"/>
                </Implies>
              </ArgumentGroups>
            </Command>
            <Command name="test" describe="Test regular expression definitions" inherits="duo-command">
              <Arguments>
                <ArgumentRef name="config"/>
                <ArgumentRef name="expr"/>
                <ArgumentRef name="input"/>
              </Arguments>
              <ArgumentGroups>
                <Implies>
                  <ArgumentRef name="input"/>
                  <ArgumentRef name="expr"/>
                  <ArgumentRef name="input"/>
                </Implies>
              </ArgumentGroups>
            </Command>
          </Commands>
        </Cli>
      </Application>`;

    const document: Document = parser.parseFromString(data, 'text/xml');
    const commandsNode: types.SelectResult = xp.select('/Application/Cli/Commands', document, true);

    if (commandsNode && commandsNode instanceof Node) {
      const converter = new Jaxom();
      const testCommandNode: types.NullableNode = Helpers.selectElementNodeById(
        'Command', 'name', 'test', commandsNode);

      if (testCommandNode) {
        it('should: return a command object with all children attached', () => {
          const command: any = converter.buildElement(testCommandNode, testParseInfo);
          let result = Helpers.logIfFailedStringify(R.where({
            'name': R.equals('test'),
            'describe': R.equals('Test regular expression definitions'),
            '_': R.equals('Command'),
            '_children': R.is(Array)
          })(command), command);

          expect(result).to.be.true(functify(command));
        });

        it('should: return a command object where no of children is 4', () => {
          const command: any = converter.buildElement(testCommandNode, testParseInfo);
          let children = command['_children'];

          expect(children.length).to.equal(4);
        });
      } else {
        assert.fail('Couldn\'t get Command node.');
      }
    } else {
      assert.fail('Couldn\'t get Commands node.');
    }
  });

  context('given: command with single inheritance chain and local & inherited arguments', () => {
    const data = `<?xml version="1.0"?>
      <Application name="pez">
        <Cli>
          <Commands>
            <Command name="uni-command" abstract="true">
              <Arguments>
                <ArgumentRef name="path"/>
                <ArgumentRef name="filesys"/>
                <ArgumentRef name="tree"/>
              </Arguments>
            </Command>
            <Command name="duo-command" abstract="true" inherits="uni-command">
              <Arguments>
                <ArgumentRef name="from"/>
                <ArgumentRef name="to"/>
              </Arguments>
            </Command>
            <Command name="test" describe="Test regular expression definitions" inherits="duo-command">
              <Arguments>
                <ArgumentRef name="config"/>
                <ArgumentRef name="expr"/>
                <ArgumentRef name="input"/>
              </Arguments>
            </Command>
          </Commands>
        </Cli>
      </Application>`;

    const document: Document = parser.parseFromString(data, 'text/xml');
    const commandsNode: types.SelectResult = xp.select('/Application/Cli/Commands', document, true);

    if (commandsNode && commandsNode instanceof Node) {
      const converter = new Jaxom();
      let testCommandNode: types.NullableNode = Helpers.selectElementNodeById(
        'Command', 'name', 'test', commandsNode);

      if (testCommandNode) {
        let command: any = converter.buildElement(testCommandNode, testParseInfo);

        if (command) {
          it('should: return a command object with all children attached', () => {
            let result = Helpers.logIfFailedStringify(R.where({
              'name': R.equals('test'),
              'describe': R.equals('Test regular expression definitions'),
              '_': R.equals('Command'),
              '_children': R.is(Array)
            })(command), command);

            expect(result).to.be.true(functify(command));
          });

          it('should: return a command object where no of children is 3', () => {
            let children = command['_children'];

            expect(children.length).to.equal(3);
          });
        }
      } else {
        assert.fail('Couldn\'t get Command node.');
      }
    } else {
      assert.fail('Couldn\'t get Commands node.');
    }
  });

  context('given: command with dual inheritance and local & inherited arguments', () => {
    const data = `<?xml version="1.0"?>
      <Application name="pez">
        <Cli>
          <Commands>
            <Command name="uni-command" abstract="true">
              <Arguments>
                <ArgumentRef name="path"/>
                <ArgumentRef name="filesys"/>
                <ArgumentRef name="tree"/>
              </Arguments>
            </Command>
            <Command name="duo-command" abstract="true">
              <Arguments>
                <ArgumentRef name="from"/>
                <ArgumentRef name="to"/>
              </Arguments>
            </Command>
            <Command name="test" describe="Test regular expression definitions" inherits="duo-command,uni-command">
              <Arguments>
                <ArgumentRef name="config"/>
                <ArgumentRef name="expr"/>
                <ArgumentRef name="input"/>
              </Arguments>
            </Command>
          </Commands>
        </Cli>
      </Application>`;

    const document: Document = parser.parseFromString(data, 'text/xml');
    const commandsNode: types.SelectResult = xp.select('/Application/Cli/Commands', document, true);

    if (commandsNode && commandsNode instanceof Node) {
      const converter = new Jaxom();
      const testCommandNode: types.NullableNode = Helpers.selectElementNodeById(
        'Command', 'name', 'test', commandsNode);

      if (testCommandNode) {
        const command: any = converter.buildElement(
          testCommandNode, testParseInfo);

        if (command) {
          it('should: return a command object with all children attached', () => {
            let result = Helpers.logIfFailedStringify(R.where({
              'name': R.equals('test'),
              'describe': R.equals('Test regular expression definitions'),
              '_': R.equals('Command'),
              '_children': R.is(Array)
            })(command), command);

            expect(result).to.be.true(functify(command));
          });

          it('return a command object with all 3 children attached', () => {
            let children = command['_children'];

            expect(children.length).to.equal(3);
          });
        } else {
          assert.fail('Couldn\'t build element');
        }
      } else {
        assert.fail('Couldn\'t get Command node.');
      }
    } else {
      assert.fail('Couldn\'t get Commands node.');
    }
  });

  context('given: an Expression with CDATA section', () => {
    it('should: return an expression object with text stored as a child.', () => {
      const data = `<?xml version="1.0"?>
        <Application name="pez">
          <Expressions name="content-expressions">
            <Expression name="meta-prefix-expression">
              <Pattern eg="_"><![CDATA[SOME-TEXT]]></Pattern>
              <Pattern eg="cover" csv="meta-csv"/>
              <Pattern eg=".">MORE-TEXT-NO-CDATA</Pattern>
              <Pattern eg="media."><![CDATA[(media.)?]]></Pattern>
            </Expression>
          </Expressions>
        </Application>`;

      const document: Document = parser.parseFromString(data, 'text/xml');
      const expressionsNode: types.SelectResult = xp.select(
        '/Application/Expressions[@name="content-expressions"]', document, true);

      if (expressionsNode && expressionsNode instanceof Node) {
        const converter = new Jaxom();
        let expressionNode: types.NullableNode = Helpers.selectElementNodeById(
          'Expression', 'name', 'meta-prefix-expression', expressionsNode);

        if (expressionNode) {
          let command: {} = converter.buildElement(expressionNode, testParseInfo);

          let result = Helpers.logIfFailedStringify(R.where({
            'name': R.equals('meta-prefix-expression')
          })(command), command);

          expect(result).to.be.true(functify(command));
        } else {
          assert.fail('Couldn\'t get Expressions node.');
        }
      } else {
        assert.fail('Couldn\'t get Expressions node.');
      }
    });
  });
}); // xpath-converter.buildElement