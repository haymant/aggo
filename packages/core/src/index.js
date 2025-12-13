import React from 'react';
import assert from 'assert';
export const BuiltinButton = ({ attributes, content, editMode, onSelect }) => {
    const label = (attributes === null || attributes === void 0 ? void 0 : attributes.label) || content || 'Button';
    const style = {
        padding: '8px 12px',
        background: '#2563eb',
        color: 'white',
        borderRadius: 4,
        border: 'none',
        cursor: editMode ? 'pointer' : 'default'
    };
    return (React.createElement("button", { className: "aggo-builtin-button", style: style, onClick: (e) => { if (editMode) {
            e.preventDefault();
            e.stopPropagation();
            onSelect && onSelect();
        } } }, label));
};
export const BuiltinHeader = ({ attributes, content }) => {
    const level = parseInt(String((attributes === null || attributes === void 0 ? void 0 : attributes.level) || '1'), 10);
    const Tag = `h${Math.min(Math.max(level, 1), 6)}`;
    return React.createElement(Tag, null, content || 'Heading');
};
export const builtins = {
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
};
// Provide lowercase/HTML tag aliases to keep existing page templates compatible
builtins['button'] = builtins['Button'];
builtins['h1'] = { ...builtins['Header'], defaultAttributes: { level: 1 } };
builtins['h2'] = { ...builtins['Header'], defaultAttributes: { level: 2 } };
builtins['h3'] = { ...builtins['Header'], defaultAttributes: { level: 3 } };
builtins['h4'] = { ...builtins['Header'], defaultAttributes: { level: 4 } };
export default builtins;
// Simple runtime validation helper for schema shapes — intentionally minimal and local
export const validateSchema = (schema) => {
    assert(schema && typeof schema === 'object', 'schema must be an object');
    if (schema.properties) {
        for (const k of Object.keys(schema.properties)) {
            const p = schema.properties[k];
            if (!p.type)
                throw new Error(`property ${k} missing type`);
        }
    }
    return true;
};
//# sourceMappingURL=index.js.map