import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../../HTML/js/display.js', import.meta.url), 'utf8');
function displayApi(fetchOverride) {
  const storage = new Map();
  const observations = [];
  const intervals = [];
  let settings = {showWeather:false,weatherEffects:false};
  const element = () => ({ style:{}, textContent:'', className:'', children:[], classList:{add(){},remove(){}}, appendChild(child){this.children.push(child);}, querySelector(){return null;} });
  const nodes = Object.fromEntries(['current-time','current-date','weather-info','weather-text','weather-locations','weather-location-text'].map(id => [id,element()]));
  const document = {getElementById:id => nodes[id] || null, createElement:element,addEventListener(){}};
  const localStorage = {getItem:key => storage.get(key) || null,setItem:(key,value) => storage.set(key,value)};
  const window = {addEventListener(){},showMessage(){},setInterval(fn){intervals.push(fn);},applyWeatherAtmosphere:sample=>observations.push(sample)};
  const getSetting = (key, fallback) => key === 'displaySettings' ? settings : fallback;
  const fetch = fetchOverride || (async () => ({ok:true,json:async () => ({current_condition:[{lang_zh:[{value:'晴'}],weatherCode:'113',temp_C:'22',humidity:'60',FeelsLikeC:'21'}],nearest_area:[{areaName:[{value:'Shanghai'}]}]})}));
  const api = new Function('window','document','navigator','localStorage','getSetting','setSetting','fetch','escapeHTML',source+'\nreturn {fetchWeatherForCity,getCachedWeather,renderWeatherTextFromCache,formatDate,updateWeather,weatherObservationFromText};')(window,document,{onLine:true},localStorage,getSetting,()=>{},fetch,String);
  return {api,nodes,storage,observations,intervals,setSettings:value=>{settings=value;}};
}
test('天气成功后保存城市、温度与详情缓存，缓存能够恢复详情', async () => {
  const {api,nodes} = displayApi();
  await api.fetchWeatherForCity('shanghai','C','weather-text');
  const cache = api.getCachedWeather(['shanghai'],'C');
  assert.equal(cache.text, '晴 22°C');
  assert.equal(cache.detail.humidity, '60');
  assert.equal(nodes['weather-text'].textContent, '晴 22°C');
  api.renderWeatherTextFromCache(cache);
  assert.equal(nodes['weather-info'].children.length, 2);
});
test('天气 JSON 同步给氛围层并保留原始天气编码及摄氏温度', async () => {
  const {api,observations} = displayApi();
  await api.fetchWeatherForCity('Shanghai','C','weather-text');
  assert.equal(observations.at(-1).code,'113');
  assert.equal(observations.at(-1).city,'shanghai');
  assert.equal(observations.at(-1).temperatureC,22);
});
test('短文本回退和旧天气缓存支持华氏温度转换与降水识别', async () => {
  const {api,observations} = displayApi(async url => url.includes('j1') ? {ok:false,status:503} : {ok:true,text:async()=> 'Light snow -4°F'});
  await api.fetchWeatherForCity('Beijing','F','weather-text');
  assert.equal(observations.at(-1).temperatureC,-20);
  assert.match(observations.at(-1).description,/雪/);
  api.renderWeatherTextFromCache({text:'Fog 50°F',cities:'shanghai',unit:'F',ts:Date.now()});
  assert.equal(observations.at(-1).temperatureC,10);
});
test('多城市命中第一城市缓存，关闭天气文本仍可以使用特效', () => {
  const {api,storage,observations,setSettings} = displayApi(()=>{throw Error('不应重新请求');});
  storage.set('weatherCache',JSON.stringify({cities:'shanghai',unit:'C',text:'雨 12°C',ts:Date.now()}));
  setSettings({weatherCity:'shanghai,beijing',showWeather:false,weatherEffects:true});
  api.updateWeather();
  assert.match(observations.at(-1).description,/雨/);
  setSettings({showWeather:false,weatherEffects:false});
  api.updateWeather();
  assert.equal(observations.at(-1),null);
});
test('旧请求在关闭天气后返回时不会恢复天气特效', async () => {
  let finish;
  const {api,observations} = displayApi(()=>new Promise(resolve=>{finish=resolve;}));
  const pending=api.fetchWeatherForCity('shanghai','C','weather-text');
  api.updateWeather();
  finish({ok:true,json:async()=>({current_condition:[{temp_C:'1',weatherDesc:[{value:'Snow'}],weatherCode:338}]})});
  await pending;
  assert.equal(observations.at(-1),null);
});
test('网络失败和异常天气文本清除特效，未来缓存被拒绝', async () => {
  const {api,observations,storage}=displayApi(async()=>({ok:false,status:503}));
  await api.fetchWeatherForCity('shanghai','C','weather-text');
  assert.equal(observations.at(-1),null);
  storage.set('weatherCache',JSON.stringify({cities:'shanghai',unit:'C',ts:Date.now()+60000,text:'雪 0°C'}));
  assert.equal(api.getCachedWeather(['shanghai'],'C'),null);
});
test('日期支持中文星期和 ISO 格式', () => {
  const {api} = displayApi();
  assert.equal(api.formatDate(new Date(2026,10,13),'iso'), '2026-11-13');
  assert.match(api.formatDate(new Date(2026,10,13),'cn-week'), /星期五/);
});

// —— 时间样式：目录、下拉选项与 CSS 规则三方一致 ——
function clockApi() {
  let settings = {showWeather:false,weatherEffects:false};
  const classLog = [];
  const timeElement = { style:{}, textContent:'', classList:{ toggle(name,on){ classLog.push([name, Boolean(on)]); } } };
  const nodes = {
    'current-time': timeElement,
    'current-date': {style:{},textContent:'',classList:{toggle(){}}},
    'weather-info': {style:{},classList:{toggle(){}}},
    'weather-text': {style:{},textContent:''}
  };
  const document = {getElementById:id=>nodes[id]||null, createElement:()=>({style:{},classList:{toggle(){}}}), addEventListener(){}};
  const window = {addEventListener(){}, showMessage(){}, setInterval(){}, applyWeatherAtmosphere(){}};
  const getSetting = (key,fallback)=> key==='displaySettings' ? settings : fallback;
  const api = new Function('window','document','navigator','localStorage','getSetting','setSetting','fetch','escapeHTML', source+'\nreturn {applyClockStyle,CLOCK_STYLES,timeDisplayCache};')(window,document,{onLine:true},{getItem:()=>null,setItem(){}},getSetting,()=>{},()=>{},String);
  return {api,classLog};
}

test('CLOCK_STYLES 与设置下拉选项、CSS 规则保持一致', () => {
  const match = source.match(/const CLOCK_STYLES = \[([^\]]+)\]/);
  assert.ok(match, 'display.js 应声明 CLOCK_STYLES 数组');
  const styles = match[1].split(',').map(item => item.trim().replace(/^['"]|['"]$/g, ''));
  assert.ok(styles.length >= 12, '时间样式应不少于 12 种');
  const html = readFileSync(new URL('../../HTML/index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../HTML/CSS/navigation.css', import.meta.url), 'utf8');
  const selectBlock = html.match(/<select id="clock-style-select"[\s\S]*?<\/select>/);
  assert.ok(selectBlock, 'index.html 应包含 clock-style-select');
  const optionValues = [...selectBlock[0].matchAll(/<option value="([^"]+)">/g)].map(item => item[1]);
  assert.deepEqual(optionValues, styles, '下拉选项应与 CLOCK_STYLES 完全一致（含顺序）');
  for (const style of styles) {
    if (style === 'default') continue; // default 即基础外观，无专属规则
    assert.match(css, new RegExp(`clock-style-${style}[\\s{,:]`), `navigation.css 缺少时间样式规则: ${style}`);
  }
});

test('applyClockStyle 选中类唯一，未知样式回退 default', () => {
  const {api,classLog} = clockApi();
  classLog.length = 0; // 丢弃模块初始化（initDisplaySettings → default）阶段的记录
  api.applyClockStyle('flip');
  const onNames = classLog.filter(([,on]) => on).map(([name]) => name);
  assert.deepEqual(onNames, ['clock-style-flip']);
  assert.equal(classLog.filter(([,on]) => !on).length, api.CLOCK_STYLES.length - 1);
  classLog.length = 0;
  api.applyClockStyle('no-such-style');
  assert.deepEqual(classLog.filter(([,on]) => on).map(([name]) => name), ['clock-style-default']);
});
