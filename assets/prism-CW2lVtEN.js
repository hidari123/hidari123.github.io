/* ── prismjs 全局垫片 ──────────────────────────────────────────
 *
 * 为什么要这个文件：
 * prismjs 的组件文件（prism-typescript.js 等）不是 ES module，
 * 而是这种形式：
 *
 *     (function (Prism) { ... })(Prism);
 *
 * 末尾那个 `Prism` 是**裸全局标识符**，不是从 import 来的变量。
 * CommonJS 下 prismjs 自己在文件末尾写 `global.Prism = ...`，
 * 而组件执行时去读这个全局，所以能跑。
 *
 * Rollup 打包后这个前提没了：chunk 末尾只保留 module.exports
 * 的等价物（形如 `var K = W.exports`），**不产生任何全局变量**。
 * 于是每个组件文件执行到 `})(Prism)` 就抛：
 *
 *     ReferenceError: Prism is not defined
 *
 * 症状是代码块静默退回纯文本 —— 调用点包了 try/catch，只 console.warn。
 * 页面上就是「代码没颜色」，控制台只有一行
 * `[prism] 加载失败，代码块退回纯文本`。
 *
 * 前几轮反复查不出来的原因：
 *   - tsc / lint / build 都只看代码，不看运行时作用域
 *   - vitest 跑在 jsdom 里，prismjs 走 CJS 分支会自己建全局，正常
 *   - 单测断言的是「highlight() 返回带 token 的 HTML」，
 *     而那条路径在 jsdom 下**恰好**是通的，测不出打包后的断链
 *
 * ── 两层处理，以及为什么一层不够 ──
 *
 * 第一层：预先摆好 languages/util 的架子。
 * 因为 rollup 会把 CJS 组件的 IIFE 提到 ES 模块的 prism 核心**之前**执行
 * （实测 chunk 里组件 `})(Prism);` 的结束位置在 1756~18127，
 * 而核心的 `languages:{plain:` 在 20127）。
 * 只写 `globalThis.Prism = {}` 的话，组件往上爬时会报
 * `Cannot read properties of undefined (reading 'extend')`。
 *
 * 第二层：把全局赋值改成**合并**。
 * 架子摆好之后又报 `Cannot set properties of undefined (setting 'class-name')`，
 * 因为组件把语法注册到了架子上，而核心随后执行 `_self.Prism = _`
 * 会**整个替换**全局对象，架子连同已注册的语法一起被丢掉。
 *
 * 两层合起来就不依赖打包器的执行顺序了：
 * 无论核心先跑还是组件先跑，两边的东西都落在同一个对象上。
 *
 * 注意：这里必须是真正的 globalThis 赋值，不能用 ESM 的 import.meta，
 * 也不能指望 prismHighlight.ts 里赋值 —— 那个模块的代码在 chunk
 * 顶层 IIFE 之后才执行，来不及。
 */
(function () {
  var g =
    typeof globalThis !== "undefined"
      ? globalThis
      : typeof window !== "undefined"
        ? window
        : typeof self !== "undefined"
          ? self
          : this;

  /*
    幂等：每个语言 chunk 都带一份这个垫片（prism-typescript.js、
    prism-python.js ...），它们会并行拉取。

    如果每次都新建 store 并 defineProperty 覆盖全局，
    后到的 chunk 会把先到的 chunk 已经注册好的语法全部抹掉 ——
    实测表现为 typescript / python 相继抛
    "Cannot read properties of undefined (reading 'pattern')"。

    做法：用对象上的标记位认主。
    已经建好就直接返回，什么都不做。
  */
  if (g.__prismShimInstalled) return;
  Object.defineProperty(g, "__prismShimInstalled", {
    value: true, configurable: true, enumerable: false, writable: false,
  });

  /* 核心和组件都往这一份里写 */
  var store = { languages: {}, util: {}, hooks: {}, plugins: {} };

  /*
    组件往上爬时要用的最小 API 面。

    这里最容易踩坑：languages.ts / markdown / 等语言是「数组」，
    组件扩展它们时会继续 .push()。
    所以 extend 必须真的从 base 派生出新对象（而不是复用 base），
    否则 typescript 组件往 keyword 上追加的词条会写回 javascript，
    后面再加载 tsx 时基准就脏了。
  */
  var plain = /\S/;
  store.languages.plain = plain;
  store.languages.plaintext = plain;
  store.languages.text = plain;
  store.languages.txt = plain;

  store.languages.extend = function (id, redef) {
    var base = this[id];
    var out = {};
    if (base) {
      for (var k in base) {
        var v = base[k];
        // 数组要拷贝，不能共用引用
        out[k] = Array.isArray(v) ? v.slice() : v;
      }
    }
    for (var k2 in redef) out[k2] = redef[k2];
    return out;
  };

  store.languages.insertBefore = function (id, before, insert) {
    var target = this[id] || {};
    for (var k in insert) target[k] = insert[k];
    return target;
  };

  store.languages.DFS = function () {
    return {};
  };
  store.languages.markAsParent = function () {};

  /*
    深拷贝，但不能无限递归。

    两个坑：

    1. Prism 的语法定义里有自引用（typescript 的 generic.inside 指回
       自己），无脑 clone 会 RangeError: Maximum call stack size exceeded。
       用 seen 记录访问过的对象，第二次遇到就返回已有引用。

    2. 只能递归「普通对象和数组」。
       语法定义里混着 RegExp、字符串等，
       对 RegExp 做 for...in 拿不到任何属性，拷贝出来是个空对象 {}，
       于是 pattern 全丢，match 正则失效。
  */
  function isPlainish(v) {
    if (!v || typeof v !== "object") return false;
    if (Array.isArray(v)) return true;
    var proto = Object.getPrototypeOf(v);
    return proto === Object.prototype || proto === null;
  }

  store.util.clone = function (o, seen) {
    if (!o || typeof o !== "object") return o;
    // RegExp / Date / Function 等当叶子原样返回
    if (!isPlainish(o)) return o;

    seen = seen || [];
    for (var i = 0; i < seen.length; i++) {
      if (seen[i][0] === o) return seen[i][1];
    }
    var out = Array.isArray(o) ? [] : {};
    seen.push([o, out]);
    for (var k in o) {
      if (Object.prototype.hasOwnProperty.call(o, k)) {
        out[k] = store.util.clone(o[k], seen);
      }
    }
    return out;
  };

  /*
    合并而不是覆盖。

    核心模块执行时是 _self.Prism = _，整个替换。
    此时 languages 里已经有组件抢先注册的语法了，
    直接替换会把它们丢掉。

    languages / hooks / plugins 这类「注册表」要合并；
    函数成员（highlight / tokenize）用后到的；
    其它成员只在原来没有时才写入。
  */
  function mergeRegistry(dst, src) {
    if (!src) return dst;
    for (var k in src) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      var v = src[k];
      if (!Object.prototype.hasOwnProperty.call(dst, k) || dst[k] === undefined) {
        dst[k] = v;
      } else if (
        v && typeof v === "object" && !Array.isArray(v) &&
        dst[k] && typeof dst[k] === "object" && !Array.isArray(dst[k])
      ) {
        mergeRegistry(dst[k], v);
      }
      /* 已有值且不是注册表 -> 保留先到的（先到的是组件，后到的是核心，
         但 languages 里组件注册的是「语法定义」，核心也有，
         所以这里优先保留先到的对象再往下合并） */
    }
    return dst;
  }

  try {
    Object.defineProperty(g, "Prism", {
      configurable: true,
      enumerable: true,
      get: function () {
        return store;
      },
      set: function (incoming) {
        mergeRegistry(store, incoming);
      },
    });
  } catch (e) {
    /* 极端情况下属性不可写，退回直接赋值 */
    g.Prism = store;
  }
})();
import{g as V,c as W}from"./giscus-BbFtgGln.js";function ee(S,P){for(var i=0;i<P.length;i++){const g=P[i];if(typeof g!="string"&&!Array.isArray(g)){for(const d in g)if(d!=="default"&&!(d in S)){const v=Object.getOwnPropertyDescriptor(g,d);v&&Object.defineProperty(S,d,v.get?v:{enumerable:!0,get:()=>g[d]})}}}return Object.freeze(Object.defineProperty(S,Symbol.toStringTag,{value:"Module"}))}var X={exports:{}};(function(S){var P=typeof window<"u"?window:typeof WorkerGlobalScope<"u"&&self instanceof WorkerGlobalScope?self:{};/**
 * Prism: Lightweight, robust, elegant syntax highlighting
 *
 * @license MIT <https://opensource.org/licenses/MIT>
 * @author Lea Verou <https://lea.verou.me>
 * @namespace
 * @public
 */var i=function(g){var d=/(?:^|\s)lang(?:uage)?-([\w-]+)(?=\s|$)/i,v=0,x={},s={manual:g.Prism&&g.Prism.manual,disableWorkerMessageHandler:g.Prism&&g.Prism.disableWorkerMessageHandler,util:{encode:function t(e){return e instanceof b?new b(e.type,t(e.content),e.alias):Array.isArray(e)?e.map(t):e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/\u00a0/g," ")},type:function(t){return Object.prototype.toString.call(t).slice(8,-1)},objId:function(t){return t.__id||Object.defineProperty(t,"__id",{value:++v}),t.__id},clone:function t(e,a){a=a||{};var n,r;switch(s.util.type(e)){case"Object":if(r=s.util.objId(e),a[r])return a[r];n={},a[r]=n;for(var l in e)e.hasOwnProperty(l)&&(n[l]=t(e[l],a));return n;case"Array":return r=s.util.objId(e),a[r]?a[r]:(n=[],a[r]=n,e.forEach(function(o,u){n[u]=t(o,a)}),n);default:return e}},getLanguage:function(t){for(;t;){var e=d.exec(t.className);if(e)return e[1].toLowerCase();t=t.parentElement}return"none"},setLanguage:function(t,e){t.className=t.className.replace(RegExp(d,"gi"),""),t.classList.add("language-"+e)},currentScript:function(){if(typeof document>"u")return null;if(document.currentScript&&document.currentScript.tagName==="SCRIPT")return document.currentScript;try{throw new Error}catch(n){var t=(/at [^(\r\n]*\((.*):[^:]+:[^:]+\)$/i.exec(n.stack)||[])[1];if(t){var e=document.getElementsByTagName("script");for(var a in e)if(e[a].src==t)return e[a]}return null}},isActive:function(t,e,a){for(var n="no-"+e;t;){var r=t.classList;if(r.contains(e))return!0;if(r.contains(n))return!1;t=t.parentElement}return!!a}},languages:{plain:x,plaintext:x,text:x,txt:x,extend:function(t,e){var a=s.util.clone(s.languages[t]);for(var n in e)a[n]=e[n];return a},insertBefore:function(t,e,a,n){n=n||s.languages;var r=n[t],l={};for(var o in r)if(r.hasOwnProperty(o)){if(o==e)for(var u in a)a.hasOwnProperty(u)&&(l[u]=a[u]);a.hasOwnProperty(o)||(l[o]=r[o])}var f=n[t];return n[t]=l,s.languages.DFS(s.languages,function(m,w){w===f&&m!=t&&(this[m]=l)}),l},DFS:function t(e,a,n,r){r=r||{};var l=s.util.objId;for(var o in e)if(e.hasOwnProperty(o)){a.call(e,o,e[o],n||o);var u=e[o],f=s.util.type(u);f==="Object"&&!r[l(u)]?(r[l(u)]=!0,t(u,a,null,r)):f==="Array"&&!r[l(u)]&&(r[l(u)]=!0,t(u,a,o,r))}}},plugins:{},highlightAll:function(t,e){s.highlightAllUnder(document,t,e)},highlightAllUnder:function(t,e,a){var n={callback:a,container:t,selector:'code[class*="language-"], [class*="language-"] code, code[class*="lang-"], [class*="lang-"] code'};s.hooks.run("before-highlightall",n),n.elements=Array.prototype.slice.apply(n.container.querySelectorAll(n.selector)),s.hooks.run("before-all-elements-highlight",n);for(var r=0,l;l=n.elements[r++];)s.highlightElement(l,e===!0,n.callback)},highlightElement:function(t,e,a){var n=s.util.getLanguage(t),r=s.languages[n];s.util.setLanguage(t,n);var l=t.parentElement;l&&l.nodeName.toLowerCase()==="pre"&&s.util.setLanguage(l,n);var o=t.textContent,u={element:t,language:n,grammar:r,code:o};function f(w){u.highlightedCode=w,s.hooks.run("before-insert",u),u.element.innerHTML=u.highlightedCode,s.hooks.run("after-highlight",u),s.hooks.run("complete",u),a&&a.call(u.element)}if(s.hooks.run("before-sanity-check",u),l=u.element.parentElement,l&&l.nodeName.toLowerCase()==="pre"&&!l.hasAttribute("tabindex")&&l.setAttribute("tabindex","0"),!u.code){s.hooks.run("complete",u),a&&a.call(u.element);return}if(s.hooks.run("before-highlight",u),!u.grammar){f(s.util.encode(u.code));return}if(e&&g.Worker){var m=new Worker(s.filename);m.onmessage=function(w){f(w.data)},m.postMessage(JSON.stringify({language:u.language,code:u.code,immediateClose:!0}))}else f(s.highlight(u.code,u.grammar,u.language))},highlight:function(t,e,a){var n={code:t,grammar:e,language:a};if(s.hooks.run("before-tokenize",n),!n.grammar)throw new Error('The language "'+n.language+'" has no grammar.');return n.tokens=s.tokenize(n.code,n.grammar),s.hooks.run("after-tokenize",n),b.stringify(s.util.encode(n.tokens),n.language)},tokenize:function(t,e){var a=e.rest;if(a){for(var n in a)e[n]=a[n];delete e.rest}var r=new T;return E(r,r.head,t),L(t,r,e,r.head,0),j(r)},hooks:{all:{},add:function(t,e){var a=s.hooks.all;a[t]=a[t]||[],a[t].push(e)},run:function(t,e){var a=s.hooks.all[t];if(!(!a||!a.length))for(var n=0,r;r=a[n++];)r(e)}},Token:b};g.Prism=s;function b(t,e,a,n){this.type=t,this.content=e,this.alias=a,this.length=(n||"").length|0}b.stringify=function t(e,a){if(typeof e=="string")return e;if(Array.isArray(e)){var n="";return e.forEach(function(f){n+=t(f,a)}),n}var r={type:e.type,content:t(e.content,a),tag:"span",classes:["token",e.type],attributes:{},language:a},l=e.alias;l&&(Array.isArray(l)?Array.prototype.push.apply(r.classes,l):r.classes.push(l)),s.hooks.run("wrap",r);var o="";for(var u in r.attributes)o+=" "+u+'="'+(r.attributes[u]||"").replace(/"/g,"&quot;")+'"';return"<"+r.tag+' class="'+r.classes.join(" ")+'"'+o+">"+r.content+"</"+r.tag+">"};function _(t,e,a,n){t.lastIndex=e;var r=t.exec(a);if(r&&n&&r[1]){var l=r[1].length;r.index+=l,r[0]=r[0].slice(l)}return r}function L(t,e,a,n,r,l){for(var o in a)if(!(!a.hasOwnProperty(o)||!a[o])){var u=a[o];u=Array.isArray(u)?u:[u];for(var f=0;f<u.length;++f){if(l&&l.cause==o+","+f)return;var m=u[f],w=m.inside,q=!!m.lookbehind,U=!!m.greedy,J=m.alias;if(U&&!m.pattern.global){var N=m.pattern.toString().match(/[imsuy]*$/)[0];m.pattern=RegExp(m.pattern.source,N+"g")}for(var Z=m.pattern||m,y=n.next,A=r;y!==e.tail&&!(l&&A>=l.reach);A+=y.value.length,y=y.next){var $=y.value;if(e.length>t.length)return;if(!($ instanceof b)){var z=1,F;if(U){if(F=_(Z,A,t,q),!F||F.index>=t.length)break;var D=F.index,K=F.index+F[0].length,k=A;for(k+=y.value.length;D>=k;)y=y.next,k+=y.value.length;if(k-=y.value.length,A=k,y.value instanceof b)continue;for(var C=y;C!==e.tail&&(k<K||typeof C.value=="string");C=C.next)z++,k+=C.value.length;z--,$=t.slice(A,k),F.index-=A}else if(F=_(Z,0,$,q),!F)continue;var D=F.index,I=F[0],R=$.slice(0,D),B=$.slice(D+I.length),G=A+$.length;l&&G>l.reach&&(l.reach=G);var O=y.prev;R&&(O=E(e,O,R),A+=R.length),M(e,O,z);var Q=new b(o,w?s.tokenize(I,w):I,J,I);if(y=E(e,O,Q),B&&E(e,y,B),z>1){var H={cause:o+","+f,reach:G};L(t,e,a,y.prev,A,H),l&&H.reach>l.reach&&(l.reach=H.reach)}}}}}}function T(){var t={value:null,prev:null,next:null},e={value:null,prev:t,next:null};t.next=e,this.head=t,this.tail=e,this.length=0}function E(t,e,a){var n=e.next,r={value:a,prev:e,next:n};return e.next=r,n.prev=r,t.length++,r}function M(t,e,a){for(var n=e.next,r=0;r<a&&n!==t.tail;r++)n=n.next;e.next=n,n.prev=e,t.length-=r}function j(t){for(var e=[],a=t.head.next;a!==t.tail;)e.push(a.value),a=a.next;return e}if(!g.document)return g.addEventListener&&(s.disableWorkerMessageHandler||g.addEventListener("message",function(t){var e=JSON.parse(t.data),a=e.language,n=e.code,r=e.immediateClose;g.postMessage(s.highlight(n,s.languages[a],a)),r&&g.close()},!1)),s;var p=s.util.currentScript();p&&(s.filename=p.src,p.hasAttribute("data-manual")&&(s.manual=!0));function c(){s.manual||s.highlightAll()}if(!s.manual){var h=document.readyState;h==="loading"||h==="interactive"&&p&&p.defer?document.addEventListener("DOMContentLoaded",c):window.requestAnimationFrame?window.requestAnimationFrame(c):window.setTimeout(c,16)}return s}(P);S.exports&&(S.exports=i),typeof W<"u"&&(W.Prism=i),i.languages.markup={comment:{pattern:/<!--(?:(?!<!--)[\s\S])*?-->/,greedy:!0},prolog:{pattern:/<\?[\s\S]+?\?>/,greedy:!0},doctype:{pattern:/<!DOCTYPE(?:[^>"'[\]]|"[^"]*"|'[^']*')+(?:\[(?:[^<"'\]]|"[^"]*"|'[^']*'|<(?!!--)|<!--(?:[^-]|-(?!->))*-->)*\]\s*)?>/i,greedy:!0,inside:{"internal-subset":{pattern:/(^[^\[]*\[)[\s\S]+(?=\]>$)/,lookbehind:!0,greedy:!0,inside:null},string:{pattern:/"[^"]*"|'[^']*'/,greedy:!0},punctuation:/^<!|>$|[[\]]/,"doctype-tag":/^DOCTYPE/i,name:/[^\s<>'"]+/}},cdata:{pattern:/<!\[CDATA\[[\s\S]*?\]\]>/i,greedy:!0},tag:{pattern:/<\/?(?!\d)[^\s>\/=$<%]+(?:\s(?:\s*[^\s>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s'">=]+(?=[\s>]))|(?=[\s/>])))+)?\s*\/?>/,greedy:!0,inside:{tag:{pattern:/^<\/?[^\s>\/]+/,inside:{punctuation:/^<\/?/,namespace:/^[^\s>\/:]+:/}},"special-attr":[],"attr-value":{pattern:/=\s*(?:"[^"]*"|'[^']*'|[^\s'">=]+)/,inside:{punctuation:[{pattern:/^=/,alias:"attr-equals"},{pattern:/^(\s*)["']|["']$/,lookbehind:!0}]}},punctuation:/\/?>/,"attr-name":{pattern:/[^\s>\/]+/,inside:{namespace:/^[^\s>\/:]+:/}}}},entity:[{pattern:/&[\da-z]{1,8};/i,alias:"named-entity"},/&#x?[\da-f]{1,8};/i]},i.languages.markup.tag.inside["attr-value"].inside.entity=i.languages.markup.entity,i.languages.markup.doctype.inside["internal-subset"].inside=i.languages.markup,i.hooks.add("wrap",function(g){g.type==="entity"&&(g.attributes.title=g.content.replace(/&amp;/,"&"))}),Object.defineProperty(i.languages.markup.tag,"addInlined",{value:function(d,v){var x={};x["language-"+v]={pattern:/(^<!\[CDATA\[)[\s\S]+?(?=\]\]>$)/i,lookbehind:!0,inside:i.languages[v]},x.cdata=/^<!\[CDATA\[|\]\]>$/i;var s={"included-cdata":{pattern:/<!\[CDATA\[[\s\S]*?\]\]>/i,inside:x}};s["language-"+v]={pattern:/[\s\S]+/,inside:i.languages[v]};var b={};b[d]={pattern:RegExp(/(<__[^>]*>)(?:<!\[CDATA\[(?:[^\]]|\](?!\]>))*\]\]>|(?!<!\[CDATA\[)[\s\S])*?(?=<\/__>)/.source.replace(/__/g,function(){return d}),"i"),lookbehind:!0,greedy:!0,inside:s},i.languages.insertBefore("markup","cdata",b)}}),Object.defineProperty(i.languages.markup.tag,"addAttribute",{value:function(g,d){i.languages.markup.tag.inside["special-attr"].push({pattern:RegExp(/(^|["'\s])/.source+"(?:"+g+")"+/\s*=\s*(?:"[^"]*"|'[^']*'|[^\s'">=]+(?=[\s>]))/.source,"i"),lookbehind:!0,inside:{"attr-name":/^[^\s=]+/,"attr-value":{pattern:/=[\s\S]+/,inside:{value:{pattern:/(^=\s*(["']|(?!["'])))\S[\s\S]*(?=\2$)/,lookbehind:!0,alias:[d,"language-"+d],inside:i.languages[d]},punctuation:[{pattern:/^=/,alias:"attr-equals"},/"|'/]}}}})}}),i.languages.html=i.languages.markup,i.languages.mathml=i.languages.markup,i.languages.svg=i.languages.markup,i.languages.xml=i.languages.extend("markup",{}),i.languages.ssml=i.languages.xml,i.languages.atom=i.languages.xml,i.languages.rss=i.languages.xml,function(g){var d=/(?:"(?:\\(?:\r\n|[\s\S])|[^"\\\r\n])*"|'(?:\\(?:\r\n|[\s\S])|[^'\\\r\n])*')/;g.languages.css={comment:/\/\*[\s\S]*?\*\//,atrule:{pattern:RegExp("@[\\w-](?:"+/[^;{\s"']|\s+(?!\s)/.source+"|"+d.source+")*?"+/(?:;|(?=\s*\{))/.source),inside:{rule:/^@[\w-]+/,"selector-function-argument":{pattern:/(\bselector\s*\(\s*(?![\s)]))(?:[^()\s]|\s+(?![\s)])|\((?:[^()]|\([^()]*\))*\))+(?=\s*\))/,lookbehind:!0,alias:"selector"},keyword:{pattern:/(^|[^\w-])(?:and|not|only|or)(?![\w-])/,lookbehind:!0}}},url:{pattern:RegExp("\\burl\\((?:"+d.source+"|"+/(?:[^\\\r\n()"']|\\[\s\S])*/.source+")\\)","i"),greedy:!0,inside:{function:/^url/i,punctuation:/^\(|\)$/,string:{pattern:RegExp("^"+d.source+"$"),alias:"url"}}},selector:{pattern:RegExp(`(^|[{}\\s])[^{}\\s](?:[^{};"'\\s]|\\s+(?![\\s{])|`+d.source+")*(?=\\s*\\{)"),lookbehind:!0},string:{pattern:d,greedy:!0},property:{pattern:/(^|[^-\w\xA0-\uFFFF])(?!\s)[-_a-z\xA0-\uFFFF](?:(?!\s)[-\w\xA0-\uFFFF])*(?=\s*:)/i,lookbehind:!0},important:/!important\b/i,function:{pattern:/(^|[^-a-z0-9])[-a-z0-9]+(?=\()/i,lookbehind:!0},punctuation:/[(){};:,]/},g.languages.css.atrule.inside.rest=g.languages.css;var v=g.languages.markup;v&&(v.tag.addInlined("style","css"),v.tag.addAttribute("style","css"))}(i),i.languages.clike={comment:[{pattern:/(^|[^\\])\/\*[\s\S]*?(?:\*\/|$)/,lookbehind:!0,greedy:!0},{pattern:/(^|[^\\:])\/\/.*/,lookbehind:!0,greedy:!0}],string:{pattern:/(["'])(?:\\(?:\r\n|[\s\S])|(?!\1)[^\\\r\n])*\1/,greedy:!0},"class-name":{pattern:/(\b(?:class|extends|implements|instanceof|interface|new|trait)\s+|\bcatch\s+\()[\w.\\]+/i,lookbehind:!0,inside:{punctuation:/[.\\]/}},keyword:/\b(?:break|catch|continue|do|else|finally|for|function|if|in|instanceof|new|null|return|throw|try|while)\b/,boolean:/\b(?:false|true)\b/,function:/\b\w+(?=\()/,number:/\b0x[\da-f]+\b|(?:\b\d+(?:\.\d*)?|\B\.\d+)(?:e[+-]?\d+)?/i,operator:/[<>]=?|[!=]=?=?|--?|\+\+?|&&?|\|\|?|[?*/~^%]/,punctuation:/[{}[\];(),.:]/},i.languages.javascript=i.languages.extend("clike",{"class-name":[i.languages.clike["class-name"],{pattern:/(^|[^$\w\xA0-\uFFFF])(?!\s)[_$A-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\.(?:constructor|prototype))/,lookbehind:!0}],keyword:[{pattern:/((?:^|\})\s*)catch\b/,lookbehind:!0},{pattern:/(^|[^.]|\.\.\.\s*)\b(?:as|assert(?=\s*\{)|async(?=\s*(?:function\b|\(|[$\w\xA0-\uFFFF]|$))|await|break|case|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally(?=\s*(?:\{|$))|for|from(?=\s*(?:['"]|$))|function|(?:get|set)(?=\s*(?:[#\[$\w\xA0-\uFFFF]|$))|if|implements|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|static|super|switch|this|throw|try|typeof|undefined|var|void|while|with|yield)\b/,lookbehind:!0}],function:/#?(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*(?:\.\s*(?:apply|bind|call)\s*)?\()/,number:{pattern:RegExp(/(^|[^\w$])/.source+"(?:"+(/NaN|Infinity/.source+"|"+/0[bB][01]+(?:_[01]+)*n?/.source+"|"+/0[oO][0-7]+(?:_[0-7]+)*n?/.source+"|"+/0[xX][\dA-Fa-f]+(?:_[\dA-Fa-f]+)*n?/.source+"|"+/\d+(?:_\d+)*n/.source+"|"+/(?:\d+(?:_\d+)*(?:\.(?:\d+(?:_\d+)*)?)?|\.\d+(?:_\d+)*)(?:[Ee][+-]?\d+(?:_\d+)*)?/.source)+")"+/(?![\w$])/.source),lookbehind:!0},operator:/--|\+\+|\*\*=?|=>|&&=?|\|\|=?|[!=]==|<<=?|>>>?=?|[-+*/%&|^!=<>]=?|\.{3}|\?\?=?|\?\.?|[~:]/}),i.languages.javascript["class-name"][0].pattern=/(\b(?:class|extends|implements|instanceof|interface|new)\s+)[\w.\\]+/,i.languages.insertBefore("javascript","keyword",{regex:{pattern:RegExp(/((?:^|[^$\w\xA0-\uFFFF."'\])\s]|\b(?:return|yield))\s*)/.source+/\//.source+"(?:"+/(?:\[(?:[^\]\\\r\n]|\\.)*\]|\\.|[^/\\\[\r\n])+\/[dgimyus]{0,7}/.source+"|"+/(?:\[(?:[^[\]\\\r\n]|\\.|\[(?:[^[\]\\\r\n]|\\.|\[(?:[^[\]\\\r\n]|\\.)*\])*\])*\]|\\.|[^/\\\[\r\n])+\/[dgimyus]{0,7}v[dgimyus]{0,7}/.source+")"+/(?=(?:\s|\/\*(?:[^*]|\*(?!\/))*\*\/)*(?:$|[\r\n,.;:})\]]|\/\/))/.source),lookbehind:!0,greedy:!0,inside:{"regex-source":{pattern:/^(\/)[\s\S]+(?=\/[a-z]*$)/,lookbehind:!0,alias:"language-regex",inside:i.languages.regex},"regex-delimiter":/^\/|\/$/,"regex-flags":/^[a-z]+$/}},"function-variable":{pattern:/#?(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*[=:]\s*(?:async\s*)?(?:\bfunction\b|(?:\((?:[^()]|\([^()]*\))*\)|(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*)\s*=>))/,alias:"function"},parameter:[{pattern:/(function(?:\s+(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*)?\s*\(\s*)(?!\s)(?:[^()\s]|\s+(?![\s)])|\([^()]*\))+(?=\s*\))/,lookbehind:!0,inside:i.languages.javascript},{pattern:/(^|[^$\w\xA0-\uFFFF])(?!\s)[_$a-z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*=>)/i,lookbehind:!0,inside:i.languages.javascript},{pattern:/(\(\s*)(?!\s)(?:[^()\s]|\s+(?![\s)])|\([^()]*\))+(?=\s*\)\s*=>)/,lookbehind:!0,inside:i.languages.javascript},{pattern:/((?:\b|\s|^)(?!(?:as|async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally|for|from|function|get|if|implements|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|set|static|super|switch|this|throw|try|typeof|undefined|var|void|while|with|yield)(?![$\w\xA0-\uFFFF]))(?:(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*\s*)\(\s*|\]\s*\(\s*)(?!\s)(?:[^()\s]|\s+(?![\s)])|\([^()]*\))+(?=\s*\)\s*\{)/,lookbehind:!0,inside:i.languages.javascript}],constant:/\b[A-Z](?:[A-Z_]|\dx?)*\b/}),i.languages.insertBefore("javascript","string",{hashbang:{pattern:/^#!.*/,greedy:!0,alias:"comment"},"template-string":{pattern:/`(?:\\[\s\S]|\$\{(?:[^{}]|\{(?:[^{}]|\{[^}]*\})*\})+\}|(?!\$\{)[^\\`])*`/,greedy:!0,inside:{"template-punctuation":{pattern:/^`|`$/,alias:"string"},interpolation:{pattern:/((?:^|[^\\])(?:\\{2})*)\$\{(?:[^{}]|\{(?:[^{}]|\{[^}]*\})*\})+\}/,lookbehind:!0,inside:{"interpolation-punctuation":{pattern:/^\$\{|\}$/,alias:"punctuation"},rest:i.languages.javascript}},string:/[\s\S]+/}},"string-property":{pattern:/((?:^|[,{])[ \t]*)(["'])(?:\\(?:\r\n|[\s\S])|(?!\2)[^\\\r\n])*\2(?=\s*:)/m,lookbehind:!0,greedy:!0,alias:"property"}}),i.languages.insertBefore("javascript","operator",{"literal-property":{pattern:/((?:^|[,{])[ \t]*)(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*:)/m,lookbehind:!0,alias:"property"}}),i.languages.markup&&(i.languages.markup.tag.addInlined("script","javascript"),i.languages.markup.tag.addAttribute(/on(?:abort|blur|change|click|composition(?:end|start|update)|dblclick|error|focus(?:in|out)?|key(?:down|up)|load|mouse(?:down|enter|leave|move|out|over|up)|reset|resize|scroll|select|slotchange|submit|unload|wheel)/.source,"javascript")),i.languages.js=i.languages.javascript,function(){if(typeof i>"u"||typeof document>"u")return;Element.prototype.matches||(Element.prototype.matches=Element.prototype.msMatchesSelector||Element.prototype.webkitMatchesSelector);var g="Loading…",d=function(p,c){return"✖ Error "+p+" while fetching file: "+c},v="✖ Error: File does not exist or is empty",x={js:"javascript",py:"python",rb:"ruby",ps1:"powershell",psm1:"powershell",sh:"bash",bat:"batch",h:"c",tex:"latex"},s="data-src-status",b="loading",_="loaded",L="failed",T="pre[data-src]:not(["+s+'="'+_+'"]):not(['+s+'="'+b+'"])';function E(p,c,h){var t=new XMLHttpRequest;t.open("GET",p,!0),t.onreadystatechange=function(){t.readyState==4&&(t.status<400&&t.responseText?c(t.responseText):t.status>=400?h(d(t.status,t.statusText)):h(v))},t.send(null)}function M(p){var c=/^\s*(\d+)\s*(?:(,)\s*(?:(\d+)\s*)?)?$/.exec(p||"");if(c){var h=Number(c[1]),t=c[2],e=c[3];return t?e?[h,Number(e)]:[h,void 0]:[h,h]}}i.hooks.add("before-highlightall",function(p){p.selector+=", "+T}),i.hooks.add("before-sanity-check",function(p){var c=p.element;if(c.matches(T)){p.code="",c.setAttribute(s,b);var h=c.appendChild(document.createElement("CODE"));h.textContent=g;var t=c.getAttribute("data-src"),e=p.language;if(e==="none"){var a=(/\.(\w+)$/.exec(t)||[,"none"])[1];e=x[a]||a}i.util.setLanguage(h,e),i.util.setLanguage(c,e);var n=i.plugins.autoloader;n&&n.loadLanguages(e),E(t,function(r){c.setAttribute(s,_);var l=M(c.getAttribute("data-range"));if(l){var o=r.split(/\r\n?|\n/g),u=l[0],f=l[1]==null?o.length:l[1];u<0&&(u+=o.length),u=Math.max(0,Math.min(u-1,o.length)),f<0&&(f+=o.length),f=Math.max(0,Math.min(f,o.length)),r=o.slice(u,f).join(`
`),c.hasAttribute("data-start")||c.setAttribute("data-start",String(u+1))}h.textContent=r,i.highlightElement(h)},function(r){c.setAttribute(s,L),h.textContent=r})}}),i.plugins.fileHighlight={highlight:function(c){for(var h=(c||document).querySelectorAll(T),t=0,e;e=h[t++];)i.highlightElement(e)}};var j=!1;i.fileHighlight=function(){j||(console.warn("Prism.fileHighlight is deprecated. Use `Prism.plugins.fileHighlight.highlight` instead."),j=!0),i.plugins.fileHighlight.highlight.apply(this,arguments)}}()})(X);var Y=X.exports;const te=V(Y),ne=ee({__proto__:null,default:te},[Y]);export{ne as p};
