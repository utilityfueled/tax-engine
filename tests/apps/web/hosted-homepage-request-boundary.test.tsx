// Spec: federal/hosted-homepage-request-boundary.yaml.
import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({headers:vi.fn(),actor:vi.fn()}));
vi.mock('../../../apps/web/node_modules/next/headers.js',()=>({headers:mocks.headers}));
vi.mock('@/lib/hosted-auth',()=>({resolveHostedWorkspaceActor:mocks.actor}));
import HomePage from '@/app/page';
beforeEach(()=>{vi.clearAllMocks();mocks.headers.mockReset();mocks.actor.mockReset();mocks.actor.mockResolvedValue(null);});
it('homepage preserves request rendering errors before auth initialization',async()=>{
 for(const error of [Object.assign(new Error('Synthetic Next static rendering interruption'),{digest:'DYNAMIC_SERVER_USAGE'}),new Error('Synthetic unavailable request context')]){
  mocks.actor.mockClear();mocks.headers.mockRejectedValue(error);let caught:unknown;try{await HomePage();}catch(failure){caught=failure;}expect(caught).toBe(error);expect(mocks.actor).not.toHaveBeenCalled();
 }
});
it('homepage retains actual request identity when resolving the actor',async()=>{
 const headers=new Headers({'cookie':'synthetic-session=PRIVATE-TEST-ONLY','x-forwarded-host':'synthetic-staging.invalid'}),before=[...headers];mocks.headers.mockResolvedValue(headers);
 await HomePage();expect(mocks.actor).toHaveBeenCalledExactlyOnceWith({requestHeaders:headers});expect(mocks.actor.mock.calls[0]?.[0]?.requestHeaders).toBe(headers);expect([...headers]).toEqual(before);
});
it('homepage preserves request-time auth failure',async()=>{
 const error=new Error('Synthetic hosted database unavailable');mocks.headers.mockResolvedValue(new Headers());mocks.actor.mockRejectedValue(error);await expect(HomePage()).rejects.toBe(error);expect(mocks.actor).toHaveBeenCalledTimes(1);
});
