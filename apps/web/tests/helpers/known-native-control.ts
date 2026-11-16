/** Spec: browser/school-part-year-known-native-control.yaml. Expected kind is a fixture contract, not a DOM inference. */
import {expect,type Page} from '@playwright/test';
export type NativeControlKind='input'|'select';
export async function enterKnownNativeControl(page:Page,label:string,value:string,kind:NativeControlKind):Promise<void>{
 if(kind!=='input'&&kind!=='select')throw Error('Explicit native field kind required');
 const span=page.locator('label').getByText(label,{exact:true}),field=span.locator('..').locator('input,select');
 await expect(page.locator('label').getByText(label,{exact:true}).locator('..').getByText(label,{exact:true})).toHaveCount(1);
 if(kind==='select')await field.selectOption(value);else{await field.fill(value);await field.press('Tab');}
}
