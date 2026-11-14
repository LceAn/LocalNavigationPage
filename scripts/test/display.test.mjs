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
