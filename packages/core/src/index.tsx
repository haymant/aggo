import React from 'react';
// Lightweight assert replacement to avoid Node core 'assert' import in the browser
const assert = (cond: any, msg?: string) => { if (!cond) throw new Error(msg || 'assert failed'); };

export type AggoComponentProps = {
  id?: string;
  attributes?: Record<string, any>;
  content?: any;
  styles?: Record<string, any>;
  editMode?: boolean;
  onSelect?: () => void;
  onChange?: (delta: any) => void;
};

export type LibraryComponentTemplate = {
  tagName: string;
  attributes?: Record<string, any>;
  styles?: Record<string, any>;
  content?: any;
  children?: LibraryComponentTemplate[];
};

export type LibraryComponentItem = {
  icon: string;
  name: string;
  description: string;
  template: LibraryComponentTemplate;
};

export type LibraryCategory = {
  key: string;
  label: string;
  components: LibraryComponentItem[];
};

// Canonical built-in templates used by the Library UI.
// These were previously hardcoded in webview/src/views/Library.tsx.
export const libraryCategories: LibraryCategory[] = [
  {
    key: 'general',
    label: 'General',
    components: [
      {
        icon: 'Square',
        name: 'Div Container',
        description: 'Layout container',
        template: {
          tagName: 'div',
          attributes: {},
          styles: {
            width: '200px',
            height: '120px',
            backgroundColor: 'transparent',
            border: '2px dashed #d1d5db',
            borderRadius: '0px',
            margin: '16px 0',
            display: 'block',
            padding: '16px',
            fontSize: '14px',
            color: '#6b7280'
          },
          content: 'Layout Container'
        }
      },
      {
        icon: 'Link',
        name: 'URL Link',
        description: 'Hyperlink element',
        template: {
          tagName: 'a',
          attributes: { href: '#' },
          styles: {
            color: '#3b82f6',
            textDecoration: 'underline',
            cursor: 'pointer',
            fontSize: '16px',
            margin: '8px 0'
          },
          content: 'Link text'
        }
      }
    ]
  },
  {
    key: 'typography',
    label: 'Typography',
    components: [
      {
        icon: 'Heading1',
        name: 'H1',
        description: 'Main heading',
        template: {
          tagName: 'h1',
          attributes: {},
          styles: {
            fontSize: '36px',
            fontWeight: 'bold',
            color: '#1f2937',
            margin: '24px 0 12px 0'
          },
          content: 'Main Heading'
        }
      },
      {
        icon: 'Heading2',
        name: 'H2',
        description: 'Sub heading',
        template: {
          tagName: 'h2',
          attributes: {},
          styles: {
            fontSize: '28px',
            fontWeight: 'bold',
            color: '#374151',
            margin: '20px 0 10px 0'
          },
          content: 'Sub Heading'
        }
      },
      {
        icon: 'Heading3',
        name: 'H3',
        description: 'Section heading',
        template: {
          tagName: 'h3',
          attributes: {},
          styles: {
            fontSize: '24px',
            fontWeight: 'bold',
            color: '#374151',
            margin: '18px 0 8px 0'
          },
          content: 'Section Heading'
        }
      },
      {
        icon: 'Heading4',
        name: 'H4',
        description: 'Subsection heading',
        template: {
          tagName: 'h4',
          attributes: {},
          styles: {
            fontSize: '20px',
            fontWeight: 'bold',
            color: '#374151',
            margin: '16px 0 6px 0'
          },
          content: 'Subsection Heading'
        }
      },
      {
        icon: 'AlignLeft',
        name: 'Paragraph',
        description: 'Text paragraph',
        template: {
          tagName: 'p',
          attributes: {},
          styles: {
            fontSize: '16px',
            color: '#374151',
            margin: '16px 0',
            lineHeight: '1.6'
          },
          content: 'Paragraph text'
        }
      },
      {
        icon: 'Quote',
        name: 'BlockQuote',
        description: 'Quote block',
        template: {
          tagName: 'blockquote',
          attributes: {},
          styles: {
            fontSize: '18px',
            color: '#6b7280',
            fontStyle: 'italic',
            borderLeft: '4px solid #d1d5db',
            paddingLeft: '16px',
            margin: '20px 0'
          },
          content: 'This is a quote'
        }
      },
      {
        icon: 'List',
        name: 'List',
        description: 'Unordered list',
        template: {
          tagName: 'ul',
          attributes: {},
          styles: {
            fontSize: '16px',
            color: '#374151',
            margin: '16px 0',
            paddingLeft: '20px'
          },
          content: `List item 1\nList item 2\nList item 3`
        }
      },
      {
        icon: 'Code',
        name: 'Code Block',
        description: 'Code display',
        template: {
          tagName: 'pre',
          attributes: {},
          styles: {
            backgroundColor: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            padding: '12px',
            fontSize: '14px',
            fontFamily: 'monospace',
            color: '#374151',
            margin: '16px 0',
            overflow: 'auto'
          },
          content: "console.log('Hello World');"
        }
      },
      {
        icon: 'Minus',
        name: 'Thematic Break',
        description: 'Horizontal rule',
        template: {
          tagName: 'hr',
          attributes: {},
          styles: {
            border: 'none',
            borderTop: '1px solid #d1d5db',
            margin: '24px 0',
            width: '100%'
          }
        }
      }
    ]
  },
  {
    key: 'media',
    label: 'Media',
    components: [
      {
        icon: 'ImageIcon',
        name: 'Image',
        description: 'Image element',
        template: {
          tagName: 'img',
          attributes: {
            src: 'https://raw.githubusercontent.com/tracodict/goflow/refs/heads/main/public/placeholder-user.jpg',
            alt: 'Placeholder image'
          },
          styles: {
            width: '200px',
            height: '150px',
            borderRadius: '8px',
            objectFit: 'cover',
            margin: '12px 0'
          }
        }
      },
      {
        icon: 'Youtube',
        name: 'YouTube Video',
        description: 'Embedded video',
        template: {
          tagName: 'iframe',
          attributes: {
            src: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
            width: '560',
            height: '315',
            frameBorder: '0',
            allowFullScreen: 'true'
          },
          styles: {
            width: '100%',
            maxWidth: '560px',
            height: '315px',
            border: 'none',
            borderRadius: '8px',
            margin: '16px 0'
          }
        }
      }
    ]
  },
  {
    key: 'form',
    label: 'Form',
    components: [
      {
        icon: 'Type',
        name: 'Label',
        description: 'Form label',
        template: {
          tagName: 'label',
          attributes: {},
          styles: {
            fontSize: '14px',
            fontWeight: '500',
            color: '#374151',
            margin: '8px 0 4px 0',
            display: 'block'
          },
          content: 'Label text'
        }
      },
      {
        icon: 'ImageIcon',
        name: 'Text Input',
        description: 'Text input field',
        template: {
          tagName: 'input',
          attributes: {
            placeholder: 'Type here...',
            type: 'text'
          },
          styles: {
            padding: '12px',
            border: '2px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '14px',
            margin: '8px 0',
            width: '200px',
            backgroundColor: 'white'
          }
        }
      },
      {
        icon: 'AlignJustify',
        name: 'Text Area',
        description: 'Multi-line text input',
        template: {
          tagName: 'textarea',
          attributes: {
            placeholder: 'Enter text...',
            rows: '4'
          },
          styles: {
            padding: '12px',
            border: '2px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '14px',
            margin: '8px 0',
            width: '200px',
            backgroundColor: 'white',
            resize: 'vertical'
          }
        }
      },
      {
        icon: 'ChevronDown',
        name: 'Select',
        description: 'Dropdown select',
        template: {
          tagName: 'select',
          attributes: {},
          styles: {
            padding: '12px',
            border: '2px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '14px',
            margin: '8px 0',
            width: '200px',
            backgroundColor: 'white'
          },
          content: `Option 1\nOption 2\nOption 3`
        }
      },
      {
        icon: 'Circle',
        name: 'Radio',
        description: 'Radio button',
        template: {
          tagName: 'label',
          attributes: {},
          styles: { display: 'block', margin: '8px' },
          children: [
            {
              tagName: 'input',
              attributes: { type: 'radio', name: 'radio-group' },
              styles: { cursor: 'pointer' }
            },
            { tagName: 'span', content: 'Radio option', styles: { marginLeft: '8px' } }
          ]
        }
      },
      {
        icon: 'CheckSquare',
        name: 'Checkbox',
        description: 'Checkbox input',
        template: {
          tagName: 'label',
          attributes: {},
          styles: { display: 'block', margin: '8px' },
          children: [
            { tagName: 'input', attributes: { type: 'checkbox' }, styles: { cursor: 'pointer' } },
            { tagName: 'span', content: 'Checkbox label', styles: { marginLeft: '8px' } }
          ]
        }
      }
    ]
  }
];

export const BuiltinButton = ({ attributes, content, editMode, onSelect }: AggoComponentProps) => {
  const label = attributes?.label || content || 'Button';
  const style = {
    padding: '8px 12px',
    background: '#2563eb',
    color: 'white',
    borderRadius: 4,
    border: 'none',
    cursor: editMode ? 'pointer' : 'default'
  } as React.CSSProperties;
  return (
    <button className="aggo-builtin-button" style={style} onClick={(e) => { if (editMode) { e.preventDefault(); e.stopPropagation(); onSelect && onSelect(); } }}>{label}</button>
  );
};

export const BuiltinHeader = ({ attributes, content }: AggoComponentProps) => {
  const level = parseInt(String(attributes?.level || '1'), 10);
  const Tag: any = `h${Math.min(Math.max(level, 1), 6)}`;
  return <Tag>{content || 'Heading'}</Tag>;
};

export const builtins: Record<string, any> = {
  Button: {
    meta: { id: 'Button', name: 'Button', category: 'Built-in', icon: '' },
    schema: { title: 'Button', properties: { label: { type: 'string', default: 'Button' } } },
    Component: BuiltinButton
  },
  Header: {
    meta: { id: 'Header', name: 'Header', category: 'Built-in', icon: '' },
    schema: { title: 'Header', properties: { level: { type: 'number', default: 1 } } },
    Component: BuiltinHeader
  }
  ,
  Input: {
    meta: { id: 'Input', name: 'Text Input', category: 'Built-in', icon: '' },
    schema: { title: 'Text Input', properties: { placeholder: { type: 'string', default: '' }, type: { type: 'string', default: 'text' } } },
    Component: ({ attributes, editMode, onSelect }: AggoComponentProps) => {
      const placeholder = attributes?.placeholder || '';
      const type = attributes?.type || 'text';
      return React.createElement('input', { placeholder, type, onClick: (e: any) => { if (editMode) { e.preventDefault(); e.stopPropagation(); onSelect && onSelect(); } } });
    }
  },
  Label: {
    meta: { id: 'Label', name: 'Label', category: 'Built-in', icon: '' },
    schema: { title: 'Label', properties: { text: { type: 'string', default: 'Label' } } },
    Component: ({ content }: AggoComponentProps) => React.createElement('label', null, content || 'Label')
  },
  Div: {
    meta: { id: 'Div', name: 'Div Container', category: 'Built-in', icon: '' },
    schema: { title: 'Div Container', properties: { padding: { type: 'string', default: '0' } } },
    Component: ({ children, styles }: any) => React.createElement('div', { style: styles }, children)
  },
  Image: {
    meta: { id: 'Image', name: 'Image', category: 'Built-in', icon: '' },
    schema: { title: 'Image', properties: { src: { type: 'string', default: '' }, alt: { type: 'string', default: '' } } },
    Component: ({ attributes, styles }: any) => React.createElement('img', { src: attributes?.src, alt: attributes?.alt, style: styles })
  }
};

// Provide lowercase/HTML tag aliases to keep existing page templates compatible
builtins['button'] = builtins['Button'];
builtins['h1'] = { ...builtins['Header'], defaultAttributes: { level: 1 } };
builtins['h2'] = { ...builtins['Header'], defaultAttributes: { level: 2 } };
builtins['h3'] = { ...builtins['Header'], defaultAttributes: { level: 3 } };
builtins['h4'] = { ...builtins['Header'], defaultAttributes: { level: 4 } };
builtins['div'] = builtins['Div'];

export default builtins;

// Simple runtime validation helper for schema shapes — intentionally minimal and local
export const validateSchema = (schema: any) => {
  assert(schema && typeof schema === 'object', 'schema must be an object');
  if (schema.properties) {
    for (const k of Object.keys(schema.properties)) {
      const p = schema.properties[k];
      if (!p.type) throw new Error(`property ${k} missing type`);
    }
  }
  return true;
};

// Validate built-in schemas at module load so problems surface early
for (const k of Object.keys(builtins)) {
  const entry = builtins[k];
  try {
    if (entry && entry.schema) validateSchema(entry.schema);
  } catch (err) {
    console.warn('[core] invalid builtin schema detected for', k, err);
  }
}

