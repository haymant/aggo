import React from 'react';
export type AggoComponentProps = {
    id?: string;
    attributes?: Record<string, any>;
    content?: any;
    styles?: Record<string, any>;
    editMode?: boolean;
    onSelect?: () => void;
    onChange?: (delta: any) => void;
};
export declare const BuiltinButton: ({ attributes, content, editMode, onSelect }: AggoComponentProps) => React.JSX.Element;
export declare const BuiltinHeader: ({ attributes, content }: AggoComponentProps) => React.JSX.Element;
export declare const builtins: Record<string, any>;
export default builtins;
export declare const validateSchema: (schema: any) => boolean;
