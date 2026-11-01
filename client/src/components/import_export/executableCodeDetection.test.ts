import { describe, it, expect } from 'vitest';
import { getSelectedExecutableCodeItems } from './executableCodeDetection.js';
import type { TemplateGroupData } from '../../engine/prompt_templates/template_types.js';

describe('getSelectedExecutableCodeItems', () => {
  it('returns empty array when templateGroupData is undefined or selectedTemplateChainIds is empty', () => {
    expect(getSelectedExecutableCodeItems(undefined, ['chain_1'])).toEqual([]);
    expect(getSelectedExecutableCodeItems({}, [])).toEqual([]);
  });

  it('ignores template chains without parserSource or with whitespace-only parserSource', () => {
    const data: TemplateGroupData = {
      group1: {
        templateChains: {
          chain_no_parser: {
            title: 'No Parser',
            description: '',
            templates: {},
          },
          chain_empty_parser: {
            title: 'Empty Parser',
            description: '',
            parserSource: '   ',
            templates: {},
          },
        },
      },
    };

    const result = getSelectedExecutableCodeItems(data, ['chain_no_parser', 'chain_empty_parser']);
    expect(result).toEqual([]);
  });

  it('only returns selected chains that have non-empty parserSource', () => {
    const data: TemplateGroupData = {
      group1: {
        templateChains: {
          chain_safe: {
            title: 'Safe Chain',
            description: '',
            templates: {},
          },
          chain_executable_selected: {
            title: 'Selected Executable Chain',
            description: '',
            parserSource: 'async (response) => response.trim()',
            templates: {},
          },
          chain_executable_unselected: {
            title: 'Unselected Executable Chain',
            description: '',
            parserSource: 'async (response) => response.toUpperCase()',
            templates: {},
          },
        },
      },
      group2: {
        templateChains: {
          chain_group2_executable: {
            title: '',
            description: '',
            parserSource: 'console.log("hello")',
            templates: {},
          },
        },
      },
    };

    const result = getSelectedExecutableCodeItems(data, [
      'chain_safe',
      'chain_executable_selected',
      'chain_group2_executable',
    ]);

    expect(result).toEqual([
      {
        chainId: 'chain_executable_selected',
        title: 'Selected Executable Chain',
        groupId: 'group1',
      },
      {
        chainId: 'chain_group2_executable',
        title: 'chain_group2_executable', // falls back to chainId when title is empty
        groupId: 'group2',
      },
    ]);
  });
});

