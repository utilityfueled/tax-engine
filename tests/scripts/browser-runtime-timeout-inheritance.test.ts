// Spec: spec/federal/browser-runtime-timeout-inheritance.yaml.
import {describe,it,expect} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

// Ordinary bodies must inherit the project/CLI deadline. Keep the existing
// exceptional PA journeys and skipped hosted fixture separately explicit.
describe('browser runtime timeout inheritance',()=>{
 it('inherits ordinary deadlines and retains only reviewed runtime exceptions',()=>{
  const folder=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../apps/web/tests');
  const observed:Array<[string,number|null]>=[];
  for(const file of readdirSync(folder).filter(file=>file.endsWith('.spec.ts')).sort()){
   const source=ts.createSourceFile(file,readFileSync(path.join(folder,file),'utf8'),ts.ScriptTarget.Latest,true);
   const visit=(node:ts.Node)=>{
    if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='setTimeout'&&node.expression.expression.getText(source)==='test'){
     const value=node.arguments[0];observed.push([file,value&&ts.isNumericLiteral(value)?Number(value.text):null]);
    }
    ts.forEachChild(node,visit);
   };visit(source);
  }
  expect(observed).toEqual([
   ['hosted-happy-paths.spec.ts',180000],
   ['pa-married-native.spec.ts',180000],
   ['pa-mi-native-history.spec.ts',180000],
   ['pa-ordinary-care-native.spec.ts',240000],
  ]);
 });
});
