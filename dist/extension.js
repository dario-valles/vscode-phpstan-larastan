(()=>{"use strict";var t={661:(t,e,i)=>{const n=i(747),s=i(87),o=Symbol.for("__RESOLVED_TEMP_DIRECTORY__");global[o]||Object.defineProperty(global,o,{value:n.realpathSync(s.tmpdir())}),t.exports=global[o]},387:(t,e)=>{function i(t,e,i,n){var s,o=!1,a=0;function r(){s&&clearTimeout(s)}function l(){for(var l=arguments.length,h=new Array(l),d=0;d<l;d++)h[d]=arguments[d];var c=this,u=Date.now()-a;function p(){a=Date.now(),i.apply(c,h)}function g(){s=void 0}o||(n&&!s&&p(),r(),void 0===n&&u>t?p():!0!==e&&(s=setTimeout(n?g:p,void 0===n?t-u:t)))}return"boolean"!=typeof e&&(n=i,i=e,e=void 0),l.cancel=function(){r(),o=!0},l}Object.defineProperty(e,"__esModule",{value:!0}),e.debounce=function(t,e,n){return void 0===n?i(t,e,!1):i(t,n,!1!==e)},e.throttle=i},120:(t,e,i)=>{Object.defineProperty(e,"__esModule",{value:!0});const n=i(549),s=i(387),o=i(661),a=i(129),r=i(622),l=i(747),h=i(765);e.PhpStanController=class{constructor(){this._analyzing=!1,this._phpstan="phpstan",this._config={},this.version=0,this.shouldAnalyseFile=()=>s.debounce(this.getConfigDebounce(),!1,this._shouldAnalyseFile.bind(this)),this._editor=()=>n.window.activeTextEditor;const t=[];n.workspace.onDidChangeConfiguration(this._initConfig,this,t),n.workspace.onDidSaveTextDocument(this._shouldAnalyseFile,this,t),n.workspace.onDidOpenTextDocument(this._shouldAnalyseFile,this,t),n.window.onDidChangeTextEditorSelection((t=>{const e=t.textEditor.document.version;if(this.version===e)return;if(this.version=e,!this._config.liveErrorTracking||"php"!=t.textEditor.document.languageId)return;const i=n.window.activeTextEditor;if(i){const t=i.document.getText(),e=i.document.uri.path,s=i.document.fileName.split("/").slice(-1);n.window.showInformationMessage(""+this._config.tmpPath);const a={fileName:`${this._config.tmpPath||o}/${s}`,isClosed:!1,languageId:"php"};l.writeFileSync(a.fileName,t),this.shouldAnalyseFile()(a,e)}else this.shouldAnalyseFile()}),this,t),this._disposable=n.Disposable.from(...t),this._statusBarItem=n.window.createStatusBarItem(n.StatusBarAlignment.Right),this._commandForFile=n.commands.registerCommand("extension.phpstanLintThisFile",this._shouldAnalyseFile.bind(this)),this._commandForFolder=n.commands.registerCommand("extension.phpstanLintThisFolder",(t=>{this._shouldAnalyseFolder(t)})),this._diagnosticCollection=n.languages.createDiagnosticCollection("phpstan_error"),this._initConfig(),this._initPhpstan()}getConfigDebounce(){return this._config.debounce||2e3}dispose(){this._diagnosticCollection.dispose(),this._commandForFolder.dispose(),this._commandForFile.dispose(),this._statusBarItem.dispose(),this._disposable.dispose()}_initPhpstan(){const t=l.existsSync("vendor/bin/phpstan")?"vendor/bin/phpstan":"phpstan";this._phpstan="win32"===h.platform?"phpstan.bat":t}_initConfig(){const t=n.workspace.getConfiguration();this._config.tmpPath=t.get("phpstan.tmpPath",o),this._config.debounce=t.get("phpstan.debounce",2e3),this._config.liveErrorTracking=t.get("phpstan.liveErrorTracking",!0),this._config.configuration=t.get("phpstan.configuration",void 0),this._config.level=t.get("phpstan.level",5),this._config.memoryLimit=t.get("phpstan.memoryLimit","1G"),this._config.noProgress=t.get("phpstan.noProgress",!0);const e="vendor/autoload.php";this._config.autoloadFile=t.get("phpstan.autoloadFile",l.existsSync(e)?e:void 0)}_shouldAnalyseFile(t,e){var i,n;if(!(null===(i=t)||void 0===i?void 0:i.fileName)||!e){if(!this._editor())return;t=null===(n=this._editor())||void 0===n?void 0:n.document}"php"===t.languageId?this.analyseFile(t.fileName,e):this._statusBarItem.hide()}_shouldAnalyseFolder(t){var e;if(null===(e=t)||void 0===e?void 0:e.fsPath)return this.analyseFolder(t.fsPath);const i=n.window.activeTextEditor;return i?this.analyseFolder(r.dirname(i.document.fileName)):this._statusBarItem.hide()}analyseFile(t,e){this.analyse(t,e)}analyseFolder(t){this.analyse(t)}setDiagnostics(t,e){if(t.files){const i=n.window.activeTextEditor,s=i?i.document:null;for(const i in t.files){const o=t.files[i].messages,a=[],r=n.Uri.file(e||i),l=r.toString();this._diagnosticCollection.delete(r),o.forEach((t=>{var e;const i=(t.line||1)-1;let o;const r=t.message;if((null===(e=s)||void 0===e?void 0:e.uri.toString())===l){o=new n.Range(i,0,i,s.lineAt(i).range.end.character+1);const t=s.getText(o),e=/^(\s*).*(\s*)$/.exec(t);o=e?new n.Range(i,e[1].length,i,t.length-e[2].length):new n.Range(i,0,i,1)}else o=new n.Range(i,0,i,1);a.push(new n.Diagnostic(o,"[phpstan] "+r))})),this._diagnosticCollection.set(r,a)}}}analyse(t,e){var i,s;if(this._analyzing)return null;this._analyzing=!0,this._statusBarItem.text="[phpstan] analyzing...",this._statusBarItem.show();const o=Object.assign({},this._config),h=l.statSync(t),d=h.isFile()?r.dirname(t):h.isDirectory()?t:"",c=(null===(s=null===(i=n.workspace)||void 0===i?void 0:i.workspaceFolders)||void 0===s?void 0:s[0].uri.fsPath)||"";let u="";o.path=t,o.configuration||(o.configuration=this.upFindConfiguration(c)),o.autoloadFile||(o.autoloadFile=this.upFindAutoLoadFile(c)),!u&&h.isDirectory()&&(u=this.downFindRealWorkPath(d)),o.configuration&&o.autoloadFile&&(u=this.getCurrentWorkPath(e||d));let p="",g="",m=a.spawn(this.makeCommandPath(u),this.makeCommandArgs(o),this.setCommandOptions(u));m.stderr.on("data",(t=>{g+=t.toString()})),m.stdout.on("data",(t=>{p+=t.toString()})),m.on("exit",(i=>{if(this._analyzing=!1,this._statusBarItem.show(),h.isFile()&&this._diagnosticCollection.delete(n.Uri.file(e||t)),0===i)this._statusBarItem.text="[phpstan] passed";else if(g)this._statusBarItem.text="[phpstan] failed",n.window.showErrorMessage("It seems something wrong with PHPStan: "+g);else if(p){const i=p.indexOf('{"totals":');i>-1&&(p=p.substring(i));const n=JSON.parse(p);this.setDiagnostics(n,e||t),this._statusBarItem.text="[phpstan] error "+n.totals.file_errors}else this._statusBarItem.text="[phpstan] unknown"}))}makeCommandPath(t){let e="vendor/bin";const i="win32"===h.platform?"phpstan.bat":"phpstan";try{e=a.execSync("composer config bin-dir",{cwd:t}).toString().trim()}catch(t){}const n=r.resolve(t,e,i);try{return l.accessSync(n,l.constants.X_OK),n}catch(t){return this._phpstan}}makeCommandArgs(t){var e;const i=["analyse","--error-format=json"],n=this.getArgsLevel(null===(e=t)||void 0===e?void 0:e.level);return n&&i.push(n),t.noProgress&&i.push("--no-progress"),t.memoryLimit&&i.push("--memory-limit="+t.memoryLimit),t.configuration&&i.push("--configuration="+t.configuration),t.autoloadFile&&i.push("--autoload-file="+t.autoloadFile),t.path&&i.push(t.path),i}getArgsLevel(t){return"config"===t?null:t?"--level="+t:"--level=max"}setCommandOptions(t){return{cwd:t}}getCurrentWorkPath(t){let e="",i=0;const s=n.workspace.workspaceFolders;return s&&s.forEach(((n,s)=>{n.uri.fsPath.length>i&&0===t.indexOf(n.uri.fsPath)&&(e=n.uri.fsPath,i=e.length)})),e}downFindRealWorkPath(t){return this.tryFindRealWorkPath(t,["src","source","sources"],["phpstan.neon","phpstan.neon.dist","vendor/autoload.php"])}tryFindRealWorkPath(t,e,i){let n,s;for(let o in e)if(n=r.join(t,e[o]),l.existsSync(n))for(let t in i)if(s=r.join(n,i[t]),l.existsSync(s))return n;return""}upFindAutoLoadFile(t){const e=r.join(t,"vendor/autoload.php");return l.existsSync(e)?e:""}upFindConfiguration(t){const e=r.join(t,"phpstan.neon"),i=r.join(t,"phpstan.neon.dist");return l.existsSync(e)?e:l.existsSync(i)?i:""}}},129:t=>{t.exports=require("child_process")},747:t=>{t.exports=require("fs")},87:t=>{t.exports=require("os")},622:t=>{t.exports=require("path")},765:t=>{t.exports=require("process")},549:t=>{t.exports=require("vscode")}},e={};function i(n){var s=e[n];if(void 0!==s)return s.exports;var o=e[n]={exports:{}};return t[n](o,o.exports,i),o.exports}var n={};(()=>{var t=n;Object.defineProperty(t,"__esModule",{value:!0});const e=i(120);t.activate=function(t){t.subscriptions.push(new e.PhpStanController)},t.deactivate=function(){}})(),module.exports=n})();
//# sourceMappingURL=extension.js.map