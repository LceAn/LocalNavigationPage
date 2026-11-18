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
  const layer = {dataset:{},style:{setProperty(){}},querySelector:selector=>selector==='.weather-rain'?rain:snow};
  const document = {hidden:false,getElementById:()=>render?layer:null,body:{classList:{contains:name=>classes.has(name)}},addEventListener:(name,fn)=>{listeners[name]=fn;}};
  const media = {matches:false,addEventListener:(name,fn)=>{listeners.media=fn;}};
  const window = {innerWidth:1600,innerHeight:900,devicePixelRatio:2,matchMedia:()=>media,
    addEventListener:(name,fn)=>{listeners[name]=fn;},requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:key=>frames.delete(key),
    setTimeout:(fn,delay)=>{timers.set(++id,{fn,delay});return id;},clearTimeout:key=>timers.delete(key)};
  const sandbox = vm.createContext({window,document,performance:{now:()=>100},getSetting:(key,fallback)=>key==='displaySettings'?settings:fallback,setSetting(){},MutationObserver:class {constructor(fn){observer=fn;} observe(){}}});
  vm.runInContext(source+'\nglobalThis.api={getWeatherAtmosphereCondition,advanceColdWeatherHistory,resolveWeatherAtmosphere,getWeatherCanvasScale,resolveWeatherFxTuning,weatherFxProfile};',sandbox);
  return {api:sandbox.api,window,document,layer,rain,snow,frames,timers,listeners,settings,media,classes,mutate:()=>observer()};
}
const {api} = weatherApi();
const sample = (temperatureC=20,at=Date.now()) => ({city:'shanghai',temperatureC,at,code:113,description:'晴'});

test('天气编码按雨雪强度细分，编码优先于描述', () => {
  // 雨：毛毛雨 → 小雨 → 中雨 → 大雨 → 特大暴雨
  assert.equal(api.getWeatherAtmosphereCondition(263),'drizzle');
  assert.equal(api.getWeatherAtmosphereCondition(266),'drizzle');
  for (const code of [176,293,296]) assert.equal(api.getWeatherAtmosphereCondition(code),'rain-light');
  for (const code of [299,302]) assert.equal(api.getWeatherAtmosphereCondition(code),'rain');
  for (const code of [305,308]) assert.equal(api.getWeatherAtmosphereCondition(code),'rain-heavy');
  assert.equal(api.getWeatherAtmosphereCondition(359),'rain-torrential');
  // 雷雨：局部 → 雷阵雨 → 强雷暴
  for (const code of [200,386]) assert.equal(api.getWeatherAtmosphereCondition(code),'thunder-light');
  assert.equal(api.getWeatherAtmosphereCondition(389),'thunder');
  assert.equal(api.getWeatherAtmosphereCondition(389,'Heavy rain with thunder'),'thunder-heavy');
  // 雪：小雪 → 中雪 → 大雪 → 暴雪，雨夹雪单独一档
  for (const code of [179,323,326]) assert.equal(api.getWeatherAtmosphereCondition(code),'snow-light');
  for (const code of [329,332,350]) assert.equal(api.getWeatherAtmosphereCondition(code),'snow');
  for (const code of [227,335,338]) assert.equal(api.getWeatherAtmosphereCondition(code),'snow-heavy');
  assert.equal(api.getWeatherAtmosphereCondition(230),'snow-storm');
  for (const code of [182,317,320,362]) assert.equal(api.getWeatherAtmosphereCondition(code),'sleet');
  // 其余大类
  for (const code of [143,248,260]) assert.equal(api.getWeatherAtmosphereCondition(code),'fog');
  assert.equal(api.getWeatherAtmosphereCondition(116),'partly-cloudy');
  for (const code of [119,122]) assert.equal(api.getWeatherAtmosphereCondition(code),'cloudy');
  assert.equal(api.getWeatherAtmosphereCondition(113),'clear');
  // 编码优先于描述
  assert.equal(api.getWeatherAtmosphereCondition(113,'下雨'),'clear');
  // 没有编码时按描述分级
  assert.equal(api.getWeatherAtmosphereCondition(null,'Light snow'),'snow-light');
  assert.equal(api.getWeatherAtmosphereCondition(null,'Heavy snow'),'snow-heavy');
  assert.equal(api.getWeatherAtmosphereCondition(null,'Blizzard'),'snow-storm');
  assert.equal(api.getWeatherAtmosphereCondition(null,'雨夹雪'),'sleet');
  assert.equal(api.getWeatherAtmosphereCondition(null,'Drizzle'),'drizzle');
  assert.equal(api.getWeatherAtmosphereCondition(null,'Light rain'),'rain-light');
  assert.equal(api.getWeatherAtmosphereCondition(null,'Torrential rain'),'rain-torrential');
  assert.equal(api.getWeatherAtmosphereCondition(null,'雷阵雨'),'thunder');
  assert.equal(api.getWeatherAtmosphereCondition(null,'Strong thunderstorm'),'thunder-heavy');
  for (const text of ['Mist','雾天']) assert.equal(api.getWeatherAtmosphereCondition(null,text),'fog');
  assert.equal(api.getWeatherAtmosphereCondition(null,'Haze'),'haze');
  assert.equal(api.getWeatherAtmosphereCondition(null,'Windy'),'wind');
  assert.equal(api.getWeatherAtmosphereCondition(null,'Overcast'),'cloudy');
  assert.equal(api.getWeatherAtmosphereCondition(null,'Sunny'),'clear');
});

test('每个细分天气都有绘制配置，且强度越大粒子越多', () => {
  const kinds = ['drizzle','rain-light','rain','rain-heavy','rain-torrential',
    'thunder-light','thunder','thunder-heavy','snow-light','snow','snow-heavy','snow-storm','sleet'];
  for (const kind of kinds) {
    const profile = api.weatherFxProfile(kind);
    assert.ok(profile.family, kind + ' 缺少大类');
    assert.ok(profile.rain || profile.snow, kind + ' 缺少粒子配置');
  }
  const light = api.resolveWeatherFxTuning({weatherEffectIntensity:'light'});
  const normal = api.resolveWeatherFxTuning({weatherEffectIntensity:'normal'});
  const strong = api.resolveWeatherFxTuning({weatherEffectIntensity:'strong'});
  assert.ok(light.count < normal.count && normal.count < strong.count, '强度必须逐级递增');
  assert.ok(strong.count >= normal.count * 2, '强烈档至少是标准档的两倍，否则肉眼看不出差别');
  // 雨量越大，粒子基数越大
  assert.ok(api.weatherFxProfile('rain-torrential').rain.count > api.weatherFxProfile('drizzle').rain.count);
  assert.ok(api.weatherFxProfile('snow-storm').snow.count > api.weatherFxProfile('snow-light').snow.count);
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
  assert.equal(api.resolveWeatherAtmosphere(observation,settings,history,now).kind,'rain-light'); // 296 = 小雨
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

test('强度与速度映射到粒子数量/透明度倍率，非法值回落标准', () => {
  const normal = api.resolveWeatherFxTuning({});
  assert.equal(normal.count, 1);
  assert.equal(normal.speed, 1);
  assert.equal(normal.opacity, 1);
  assert.equal(normal.off.length, 0);

  const strong = api.resolveWeatherFxTuning({ weatherEffectIntensity: 'strong', weatherEffectSpeed: 'fast' });
  assert.ok(strong.count > normal.count);
  assert.ok(strong.speed > 1);

  const light = api.resolveWeatherFxTuning({ weatherEffectIntensity: 'light', weatherEffectSpeed: 'slow' });
  assert.ok(light.count < normal.count);
  assert.ok(light.opacity < 1);
  assert.ok(light.speed < 1);

  const junk = api.resolveWeatherFxTuning({ weatherEffectIntensity: 'x', weatherEffectSpeed: 'y', weatherEffectOff: 'rain' });
  assert.equal(junk.count, normal.count);
  assert.equal(junk.speed, normal.speed);
  assert.equal(junk.off.length, 0, '非数组的分项开关应忽略，避免误关全部效果');
});
