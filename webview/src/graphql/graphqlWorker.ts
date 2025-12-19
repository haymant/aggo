import type { GraphqlAnalysis } from './graphqlLogic';
import { analyzeSdlWithLayout, applyDirectiveToField, reorderFieldInType } from './graphqlLogic';

export type GraphqlWorkerRequest =
  | { type: 'analyze'; sdl: string }
  | { type: 'applyDirective'; sdl: string; typeName: string; fieldName: string; directiveName: 'http' | 'resolver'; args: Record<string, string> }
  | { type: 'reorderField'; sdl: string; typeName: string; fromFieldName: string; toFieldName: string };

export type GraphqlWorkerResponse =
  | { type: 'analysis'; analysis: GraphqlAnalysis }
  | { type: 'applied'; sdl: string; analysis: GraphqlAnalysis }
  | { type: 'reordered'; sdl: string; analysis: GraphqlAnalysis }
  | { type: 'error'; error: string };

self.onmessage = async (ev: MessageEvent<GraphqlWorkerRequest>) => {
  try {
    const msg = ev.data;
    if (msg.type === 'analyze') {
      const analysis = await analyzeSdlWithLayout(msg.sdl);
      (self as any).postMessage({ type: 'analysis', analysis } satisfies GraphqlWorkerResponse);
      return;
    }

    if (msg.type === 'applyDirective') {
      const sdl = applyDirectiveToField({
        sdl: msg.sdl,
        typeName: msg.typeName,
        fieldName: msg.fieldName,
        directiveName: msg.directiveName,
        directiveArgs: msg.args
      });
      const analysis = await analyzeSdlWithLayout(sdl);
      (self as any).postMessage({ type: 'applied', sdl, analysis } satisfies GraphqlWorkerResponse);
      return;
    }

    if (msg.type === 'reorderField') {
      const sdl = reorderFieldInType({
        sdl: msg.sdl,
        typeName: msg.typeName,
        fromFieldName: msg.fromFieldName,
        toFieldName: msg.toFieldName,
      });
      const analysis = await analyzeSdlWithLayout(sdl);
      (self as any).postMessage({ type: 'reordered', sdl, analysis } satisfies GraphqlWorkerResponse);
      return;
    }
  } catch (e: any) {
    (self as any).postMessage({ type: 'error', error: e?.message || String(e) } satisfies GraphqlWorkerResponse);
  }
};
