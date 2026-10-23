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
(function(e){var a="\\b(?:BASH|BASHOPTS|BASH_ALIASES|BASH_ARGC|BASH_ARGV|BASH_CMDS|BASH_COMPLETION_COMPAT_DIR|BASH_LINENO|BASH_REMATCH|BASH_SOURCE|BASH_VERSINFO|BASH_VERSION|COLORTERM|COLUMNS|COMP_WORDBREAKS|DBUS_SESSION_BUS_ADDRESS|DEFAULTS_PATH|DESKTOP_SESSION|DIRSTACK|DISPLAY|EUID|GDMSESSION|GDM_LANG|GNOME_KEYRING_CONTROL|GNOME_KEYRING_PID|GPG_AGENT_INFO|GROUPS|HISTCONTROL|HISTFILE|HISTFILESIZE|HISTSIZE|HOME|HOSTNAME|HOSTTYPE|IFS|INSTANCE|JOB|LANG|LANGUAGE|LC_ADDRESS|LC_ALL|LC_IDENTIFICATION|LC_MEASUREMENT|LC_MONETARY|LC_NAME|LC_NUMERIC|LC_PAPER|LC_TELEPHONE|LC_TIME|LESSCLOSE|LESSOPEN|LINES|LOGNAME|LS_COLORS|MACHTYPE|MAILCHECK|MANDATORY_PATH|NO_AT_BRIDGE|OLDPWD|OPTERR|OPTIND|ORBIT_SOCKETDIR|OSTYPE|PAPERSIZE|PATH|PIPESTATUS|PPID|PS1|PS2|PS3|PS4|PWD|RANDOM|REPLY|SECONDS|SELINUX_INIT|SESSION|SESSIONTYPE|SESSION_MANAGER|SHELL|SHELLOPTS|SHLVL|SSH_AUTH_SOCK|TERM|UID|UPSTART_EVENTS|UPSTART_INSTANCE|UPSTART_JOB|UPSTART_SESSION|USER|WINDOWID|XAUTHORITY|XDG_CONFIG_DIRS|XDG_CURRENT_DESKTOP|XDG_DATA_DIRS|XDG_GREETER_DATA_DIR|XDG_MENU_PREFIX|XDG_RUNTIME_DIR|XDG_SEAT|XDG_SEAT_PATH|XDG_SESSION_DESKTOP|XDG_SESSION_ID|XDG_SESSION_PATH|XDG_SESSION_TYPE|XDG_VTNR|XMODIFIERS)\\b",r={pattern:/(^(["']?)\w+\2)[ \t]+\S.*/,lookbehind:!0,alias:"punctuation",inside:null},t={bash:r,environment:{pattern:RegExp("\\$"+a),alias:"constant"},variable:[{pattern:/\$?\(\([\s\S]+?\)\)/,greedy:!0,inside:{variable:[{pattern:/(^\$\(\([\s\S]+)\)\)/,lookbehind:!0},/^\$\(\(/],number:/\b0x[\dA-Fa-f]+\b|(?:\b\d+(?:\.\d*)?|\B\.\d+)(?:[Ee]-?\d+)?/,operator:/--|\+\+|\*\*=?|<<=?|>>=?|&&|\|\||[=!+\-*/%<>^&|]=?|[?~:]/,punctuation:/\(\(?|\)\)?|,|;/}},{pattern:/\$\((?:\([^)]+\)|[^()])+\)|`[^`]+`/,greedy:!0,inside:{variable:/^\$\(|^`|\)$|`$/}},{pattern:/\$\{[^}]+\}/,greedy:!0,inside:{operator:/:[-=?+]?|[!\/]|##?|%%?|\^\^?|,,?/,punctuation:/[\[\]]/,environment:{pattern:RegExp("(\\{)"+a),lookbehind:!0,alias:"constant"}}},/\$(?:\w+|[#?*!@$])/],entity:/\\(?:[abceEfnrtv\\"]|O?[0-7]{1,3}|U[0-9a-fA-F]{8}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{1,2})/};e.languages.bash={shebang:{pattern:/^#!\s*\/.*/,alias:"important"},comment:{pattern:/(^|[^"{\\$])#.*/,lookbehind:!0},"function-name":[{pattern:/(\bfunction\s+)[\w-]+(?=(?:\s*\(?:\s*\))?\s*\{)/,lookbehind:!0,alias:"function"},{pattern:/\b[\w-]+(?=\s*\(\s*\)\s*\{)/,alias:"function"}],"for-or-select":{pattern:/(\b(?:for|select)\s+)\w+(?=\s+in\s)/,alias:"variable",lookbehind:!0},"assign-left":{pattern:/(^|[\s;|&]|[<>]\()\w+(?:\.\w+)*(?=\+?=)/,inside:{environment:{pattern:RegExp("(^|[\\s;|&]|[<>]\\()"+a),lookbehind:!0,alias:"constant"}},alias:"variable",lookbehind:!0},parameter:{pattern:/(^|\s)-{1,2}(?:\w+:[+-]?)?\w+(?:\.\w+)*(?=[=\s]|$)/,alias:"variable",lookbehind:!0},string:[{pattern:/((?:^|[^<])<<-?\s*)(\w+)\s[\s\S]*?(?:\r?\n|\r)\2/,lookbehind:!0,greedy:!0,inside:t},{pattern:/((?:^|[^<])<<-?\s*)(["'])(\w+)\2\s[\s\S]*?(?:\r?\n|\r)\3/,lookbehind:!0,greedy:!0,inside:{bash:r}},{pattern:/(^|[^\\](?:\\\\)*)"(?:\\[\s\S]|\$\([^)]+\)|\$(?!\()|`[^`]+`|[^"\\`$])*"/,lookbehind:!0,greedy:!0,inside:t},{pattern:/(^|[^$\\])'[^']*'/,lookbehind:!0,greedy:!0},{pattern:/\$'(?:[^'\\]|\\[\s\S])*'/,greedy:!0,inside:{entity:t.entity}}],environment:{pattern:RegExp("\\$?"+a),alias:"constant"},variable:t.variable,function:{pattern:/(^|[\s;|&]|[<>]\()(?:add|apropos|apt|apt-cache|apt-get|aptitude|aspell|automysqlbackup|awk|basename|bash|bc|bconsole|bg|bzip2|cal|cargo|cat|cfdisk|chgrp|chkconfig|chmod|chown|chroot|cksum|clear|cmp|column|comm|composer|cp|cron|crontab|csplit|curl|cut|date|dc|dd|ddrescue|debootstrap|df|diff|diff3|dig|dir|dircolors|dirname|dirs|dmesg|docker|docker-compose|du|egrep|eject|env|ethtool|expand|expect|expr|fdformat|fdisk|fg|fgrep|file|find|fmt|fold|format|free|fsck|ftp|fuser|gawk|git|gparted|grep|groupadd|groupdel|groupmod|groups|grub-mkconfig|gzip|halt|head|hg|history|host|hostname|htop|iconv|id|ifconfig|ifdown|ifup|import|install|ip|java|jobs|join|kill|killall|less|link|ln|locate|logname|logrotate|look|lpc|lpr|lprint|lprintd|lprintq|lprm|ls|lsof|lynx|make|man|mc|mdadm|mkconfig|mkdir|mke2fs|mkfifo|mkfs|mkisofs|mknod|mkswap|mmv|more|most|mount|mtools|mtr|mutt|mv|nano|nc|netstat|nice|nl|node|nohup|notify-send|npm|nslookup|op|open|parted|passwd|paste|pathchk|ping|pkill|pnpm|podman|podman-compose|popd|pr|printcap|printenv|ps|pushd|pv|quota|quotacheck|quotactl|ram|rar|rcp|reboot|remsync|rename|renice|rev|rm|rmdir|rpm|rsync|scp|screen|sdiff|sed|sendmail|seq|service|sftp|sh|shellcheck|shuf|shutdown|sleep|slocate|sort|split|ssh|stat|strace|su|sudo|sum|suspend|swapon|sync|sysctl|tac|tail|tar|tee|time|timeout|top|touch|tr|traceroute|tsort|tty|umount|uname|unexpand|uniq|units|unrar|unshar|unzip|update-grub|uptime|useradd|userdel|usermod|users|uudecode|uuencode|v|vcpkg|vdir|vi|vim|virsh|vmstat|wait|watch|wc|wget|whereis|which|who|whoami|write|xargs|xdg-open|yarn|yes|zenity|zip|zsh|zypper)(?=$|[)\s;|&])/,lookbehind:!0},keyword:{pattern:/(^|[\s;|&]|[<>]\()(?:case|do|done|elif|else|esac|fi|for|function|if|in|select|then|until|while)(?=$|[)\s;|&])/,lookbehind:!0},builtin:{pattern:/(^|[\s;|&]|[<>]\()(?:\.|:|alias|bind|break|builtin|caller|cd|command|continue|declare|echo|enable|eval|exec|exit|export|getopts|hash|help|let|local|logout|mapfile|printf|pwd|read|readarray|readonly|return|set|shift|shopt|source|test|times|trap|type|typeset|ulimit|umask|unalias|unset)(?=$|[)\s;|&])/,lookbehind:!0,alias:"class-name"},boolean:{pattern:/(^|[\s;|&]|[<>]\()(?:false|true)(?=$|[)\s;|&])/,lookbehind:!0},"file-descriptor":{pattern:/\B&\d\b/,alias:"important"},operator:{pattern:/\d?<>|>\||\+=|=[=~]?|!=?|<<[<-]?|[&\d]?>>|\d[<>]&?|[<>][&=]?|&[>&]?|\|[&|]?/,inside:{"file-descriptor":{pattern:/^\d/,alias:"important"}}},punctuation:/\$?\(\(?|\)\)?|\.\.|[{}[\];\\]/,number:{pattern:/(^|\s)(?:[1-9]\d*|0)(?:[.,]\d+)?\b/,lookbehind:!0}},r.inside=e.languages.bash;for(var o=["comment","function-name","for-or-select","assign-left","parameter","string","environment","function","keyword","builtin","boolean","file-descriptor","operator","punctuation","number"],s=t.variable[1].inside,n=0;n<o.length;n++)s[o[n]]=e.languages.bash[o[n]];e.languages.sh=e.languages.bash,e.languages.shell=e.languages.bash})(Prism);
