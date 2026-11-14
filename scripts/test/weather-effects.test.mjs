import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../../HTML/js/weather-effects.js', import.meta.url), 'utf8');

function weatherApi(render = false) {
  const frames = new Map();
  const timers = new Map();
  const listeners = {};
  const settings = {weatherCity:'shanghai',weatherEffects:true};
  const classes = new Set();
  let id = 0;
  let observer;
  const context = {setTransform(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){}};
  const rain = {getContext:()=>context};
  const snow = {getContext:()=>context};
  const layer = {dataset:{},querySelector:selector=>selector==='.weather-rain'?rain:snow};
  const document = {hidden:false,getElementById:()=>render?layer:null,body:{classList:{contains:name=>classes.has(name)}},addEventListener:(name,fn)=>{listeners[name]=fn;}};
  const media = {matches:false,addEventListener:(name,fn)=>{listeners.media=fn;}};
  const window = {innerWidth:1600,innerHeight:900,devicePixelRatio:2,matchMedia:()=>media,
    addEventListener:(name,fn)=>{listeners[name]=fn;},requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:key=>frames.delete(key),
    setTimeout:(fn,delay)=>{timers.set(++id,{fn,delay});return id;},clearTimeout:key=>timers.delete(key)};
  const sandbox = vm.createContext({window,document,performance:{now:()=>100},getSetting:(key,fallback)=>key==='displaySettings'?settings:fallback,setSetting(){},MutationObserver:class {constructor(fn){observer=fn;} observe(){}}});
  vm.runInContext(source+'\nglobalThis.api={getWeatherAtmosphereCondition,advanceColdWeatherHistory,resolveWeatherAtmosphere,getWeatherCanvasScale};',sandbox);
  return {api:sandbox.api,window,document,layer,rain,snow,frames,timers,listeners,settings,media,classes,mutate:()=>observer()};
}
const {api} = weatherApi();
const sample = (temperatureC=20,at=Date.now()) => ({city:'shanghai',temperatureC,at,code:113,description:'晴'});

test('天气编码覆盖雨雪雾、雨夹雪与雷阵雨，编码优先于描述', () => {
  for (const code of [176,200,263,296,308,359,389]) assert.equal(api.getWeatherAtmosphereCondition(code),'rain');
  for (const code of [179,182,227,320,338,350,377,395]) assert.equal(api.getWeatherAtmosphereCondition(code),'snow');
  for (const code of [143,248,260]) assert.equal(api.getWeatherAtmosphereCondition(code),'fog');
  assert.equal(api.getWeatherAtmosphereCondition(113,'下雨'),'clear');
  for (const text of ['Light snow','雨夹雪','Blizzard']) assert.equal(api.getWeatherAtmosphereCondition(null,text),'snow');
  for (const text of ['Mist','雾天','Haze']) assert.equal(api.getWeatherAtmosphereCondition(null,text),'fog');
  for (const text of ['Drizzle','雷阵雨']) assert.equal(api.getWeatherAtmosphereCondition(null,text),'rain');
});
test('同城市六小时内下降五度触发一小时降温，重复缓存保持截止时间', () => {
  const now=Date.now();
  const before=api.advanceColdWeatherHistory(null,sample(20,now-3600000),now-3600000);
  const after=api.advanceColdWeatherHistory(before,sample(15,now),now);
  assert.equal(after.coldUntil,now+3600000);
  assert.equal(api.advanceColdWeatherHistory(after,sample(15,now),now),after);
  const later=api.advanceColdWeatherHistory(after,sample(16,now+60000),now+60000);
  assert.equal(later.coldUntil,after.coldUntil);
});
test('跨城市、过旧历史、温度缺失与小幅变化保持正常氛围', () => {
  const now=Date.now();
  const before={city:'beijing',temperatureC:25,at:now-1000};
  assert.equal(api.advanceColdWeatherHistory(before,sample(5,now),now).coldUntil,0);
  assert.equal(api.advanceColdWeatherHistory({...before,city:'shanghai',at:now-7*3600000},sample(5,now),now).coldUntil,0);
  assert.equal(api.advanceColdWeatherHistory({...before,city:'shanghai'},sample(21,now),now).coldUntil,0);
  assert.equal(api.advanceColdWeatherHistory(before,sample(null,now),now),before);
  assert.equal(api.advanceColdWeatherHistory(before,sample(1,now+1000),now),before);
  assert.equal(api.advanceColdWeatherHistory(before,sample(1,now-31*60000),now),before);
});
test('城市与数据时效校验，以及特效开关、降温到期恢复', () => {
  const now=Date.now();
  const observation={...sample(10,now),code:296};
  const settings={weatherCity:'Shanghai,Beijing'};
  const history={city:'shanghai',coldUntil:now+1000};
  assert.equal(api.resolveWeatherAtmosphere(observation,settings,history,now).kind,'rain');
  assert.equal(api.resolveWeatherAtmosphere(observation,settings,history,now).cold,true);
  assert.equal(api.resolveWeatherAtmosphere(observation,settings,history,now+1000).cold,false);
  assert.equal(api.resolveWeatherAtmosphere(observation,{...settings,weatherEffects:false},history,now).kind,'none');
  assert.equal(api.resolveWeatherAtmosphere(observation,{weatherCity:'beijing'},history,now).kind,'none');
  assert.equal(api.resolveWeatherAtmosphere(observation,settings,history,now+1800000).kind,'none');
  assert.equal(api.resolveWeatherAtmosphere({...observation,at:now+1},settings,history,now).kind,'none');
});
test('高分屏的每层画布像素限制在两百万以内', () => {
  for (const [width,height] of [[390,844],[1920,1080],[7680,4320]]) {
    const scale=api.getWeatherCanvasScale(width,height,3);
    assert.ok(scale<=1.5);
    assert.ok(width*height*scale*scale<=2000001);
  }
});
test('渲染层响应关闭、隐藏、系统减弱动态效果与全局动画开关', () => {
  const env=weatherApi(true);
  env.window.applyWeatherAtmosphere({...sample(),code:296});
  assert.equal(env.layer.dataset.weather,'rain');
  assert.equal(env.frames.size,1);
  env.document.hidden=true;
  env.listeners.visibilitychange();
  assert.equal(env.frames.size,0);
  assert.equal(env.layer.dataset.motion,'off');
  env.document.hidden=false;
  env.listeners.visibilitychange();
  assert.equal(env.frames.size,1);
  env.media.matches=true;
  env.listeners.media();
  assert.equal(env.frames.size,0);
  env.media.matches=false;
  env.classes.add('animations-off');
  env.mutate();
  assert.equal(env.frames.size,0);
  env.classes.clear();
  env.mutate();
  assert.equal(env.frames.size,1);
  env.settings.weatherEffects=false;
  env.window.refreshWeatherAtmosphere();
  assert.equal(env.frames.size,0);
  assert.equal(env.layer.dataset.weather,'none');
});
test('雾天只运行 CSS，降温期限设置失效计时器，页面离开停止绘制', () => {
  const env=weatherApi(true);
  const now=Date.now();
  env.window.applyWeatherAtmosphere(sample(20,now-60000));
  env.window.applyWeatherAtmosphere({...sample(10,now),code:248});
  assert.equal(env.layer.dataset.weather,'fog');
  assert.equal(env.layer.dataset.cold,'true');
  assert.equal(env.frames.size,0);
  assert.ok([...env.timers.values()][0].delay<=1800000);
  env.window.applyWeatherAtmosphere({...sample(10,now),code:338});
  assert.equal(env.frames.size,1);
  env.listeners.pagehide();
  assert.equal(env.frames.size,0);
});
