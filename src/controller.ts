import {
  commands,
  languages,
  workspace,
  window,
  Disposable,
  Diagnostic,
  DiagnosticCollection,
  Range,
  StatusBarAlignment,
  StatusBarItem,
  TextDocument,
  Uri,
} from "vscode";
import { debounce } from 'throttle-debounce';
const tempDirectory = require("temp-dir");
import * as child_process from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as process from "process";

interface PhpStanOutput {
  totals: {
    errors: number;
    files: number;
  };
  files: {
    [propName: string]: {
      error: number;
      messages: {
        message: string;
        line: number | null;
        ignorable: boolean;
      }[];
    };
  };
  errors: any;
}

interface PhpStanArgs {
  autoloadFile?: string;
  configuration?: string;
  level?: number | string;
  memoryLimit?: string;
  noProgress?: boolean;
  path?: string;
  debounce?: number;
  liveErrorTracking?: boolean;
  tmpPath: string
}

export class PhpStanController {
  private _analyzing: boolean = false;
  private _phpstan: string = "phpstan";
  private _diagnosticCollection: DiagnosticCollection;
  private _disposable: Disposable;
  private _statusBarItem: StatusBarItem;
  private _commandForFile: Disposable;
  private _commandForFolder: Disposable;
  private _config: PhpStanArgs = {
    tmpPath: tempDirectory,
  };

  public constructor() {
    const subscriptions: Disposable[] = [];

    workspace.onDidChangeConfiguration(this._initConfig, this, subscriptions);
    workspace.onDidSaveTextDocument(
      this._shouldAnalyseFile,
      this,
      subscriptions
    );
    workspace.onDidOpenTextDocument(
      this._shouldAnalyseFile,
      this,
      subscriptions
    );

    window.onDidChangeTextEditorSelection(
      (e) => {
        if (!this._config.liveErrorTracking || e.textEditor.document.languageId != 'php'){
          return;
        }
        const editor = window.activeTextEditor;
        if (editor) {
          const documentText = editor.document.getText();
          const originalPath = editor.document.uri.path;
          const originalName = editor.document.fileName.split('/').slice(-1);
          const document = {
            fileName: `${this._config.tmpPath}/${originalName}`,
            isClosed: false,
            languageId: "php",
          };
          fs.writeFileSync(document.fileName, documentText);
          this.shouldAnalyseFile()(document, originalPath);
        } else {
          this.shouldAnalyseFile();
        }
      },
      this,
      subscriptions
    );
    this._disposable = Disposable.from(...subscriptions);
    this._statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right);
    this._commandForFile = commands.registerCommand(
      "extension.phpstanLintThisFile",
      this._shouldAnalyseFile.bind(this)
    );
    this._commandForFolder = commands.registerCommand(
      "extension.phpstanLintThisFolder",
      (resource: any) => {
        this._shouldAnalyseFolder(resource);
      }
    );

    this._diagnosticCollection =
      languages.createDiagnosticCollection("phpstan_error");

    this._initConfig();
    this._initPhpstan();
  }

  public shouldAnalyseFile = () =>
    debounce(
      this.getConfigDebounce(),
      false,
      this._shouldAnalyseFile.bind(this)
    );

  private getConfigDebounce(): number {
    return this._config.debounce || 2000;
  }

  public dispose() {
    this._diagnosticCollection.dispose();
    this._commandForFolder.dispose();
    this._commandForFile.dispose();
    this._statusBarItem.dispose();
    this._disposable.dispose();
  }

  private _initPhpstan() {
    const vendorPath = "vendor/bin/phpstan";
    const phpstanPath = fs.existsSync("vendor/bin/phpstan")
      ? vendorPath
      : "phpstan";
    this._phpstan = process.platform === "win32" ? "phpstan.bat" : phpstanPath;
  }

  private _initConfig() {
    const workspace_config = workspace.getConfiguration();

    this._config.tmpPath = workspace_config.get(
      "phpstan.tmpPath",
      tempDirectory
    );
    this._config.debounce = workspace_config.get("phpstan.debounce", 2000);
    this._config.liveErrorTracking = workspace_config.get(
      "phpstan.liveErrorTracking",
      true
    );
    this._config.configuration = workspace_config.get(
      "phpstan.configuration",
      undefined
    );
    this._config.level = workspace_config.get("phpstan.level", "max");
    this._config.memoryLimit = workspace_config.get(
      "phpstan.memoryLimit",
      "512M"
    );
    this._config.noProgress = workspace_config.get("phpstan.noProgress", true);

    const autoloadPath = "vendor/autoload.php";
    this._config.autoloadFile = workspace_config.get(
      "phpstan.autoloadFile",
      fs.existsSync(autoloadPath) ? autoloadPath : undefined
    );
  }

  private _shouldAnalyseFile(document?: any, originalPath?: string) {
    if (!document || !document.fileName || !originalPath) {
      let editor = window.activeTextEditor;
      if (editor) {
        document = editor.document;
      } else {
        return;
      }
    }
    if (document.languageId === "php") {
      this.analyseFile(document.fileName, originalPath);
    } else {
      this._statusBarItem.hide();
    }
  }

  private _shouldAnalyseFolder(resource: any) {
    if (resource && resource.fsPath) {
      this.analyseFolder(resource.fsPath);
    } else {
      let editor = window.activeTextEditor;
      if (editor) {
        this.analyseFolder(path.dirname(editor.document.fileName));
      } else {
        this._statusBarItem.hide();
      }
    }
  }

  public analyseFile(file: string, originalPath?: string) {
    this.analyse(file, originalPath);
  }

  public analyseFolder(dir: string) {
    this.analyse(dir);
  }

  protected setDiagnostics(data: PhpStanOutput, originalPath: string) {
    if (data.files) {
      let editor = window.activeTextEditor;
      let document: TextDocument | null = editor ? editor.document : null;
      for (let file in data.files) {
        let output_files = data.files[file];
        let output_messages = output_files.messages;
        let diagnostics: Diagnostic[] = [];
        let uri = Uri.file(originalPath || file);
        let uri_string = uri.toString();

        this._diagnosticCollection.delete(uri);

        output_messages.forEach((el) => {
          let line = (el.line || 1) - 1;
          let range: Range;
          let message = el.message;
          if (document && document.uri.toString() === uri_string) {
            range = new Range(
              line,
              0,
              line,
              document.lineAt(line).range.end.character + 1
            );
            let text = document.getText(range);
            let result = /^(\s*).*(\s*)$/.exec(text);
            if (result) {
              range = new Range(
                line,
                result[1].length,
                line,
                text.length - result[2].length
              );
            } else {
              range = new Range(line, 0, line, 1);
            }
          } else {
            range = new Range(line, 0, line, 1);
          }
          diagnostics.push(new Diagnostic(range, "[phpstan] " + message));
        });
        this._diagnosticCollection.set(uri, diagnostics);
      }
    }
  }

  protected analyse(thePath: string, originalPath?: string) {
    if (this._analyzing) {
      return null;
    }
    this._analyzing = true;
    this._statusBarItem.text = "[phpstan] analyzing...";
    this._statusBarItem.show();
    let args: PhpStanArgs = { ...this._config };
    let cwd: string = "";
    let stats = fs.statSync(thePath);
    let baseDir: string = "";
    if (stats.isFile()) {
      baseDir = path.dirname(thePath);
    } else if (stats.isDirectory()) {
      baseDir = thePath;
    } else {
      return null;
    }
    args.path = thePath;

    if (!args.configuration && !args.autoloadFile) {
      args.configuration = this.upFindConfiguration(originalPath || baseDir);
      if (args.configuration) {
        cwd = path.dirname(args.configuration);
      } else {
        args.autoloadFile = this.upFindAutoLoadFile(originalPath || baseDir);
      }
      if (args.autoloadFile) {
        cwd = path.dirname(args.autoloadFile);
        cwd = path.dirname(cwd);
      }
      if (!cwd && stats.isDirectory()) {
        cwd = this.downFindRealWorkPath(baseDir);
      }
    } else {
      cwd = this.getCurrentWorkPath(originalPath || baseDir);
    }
    let result = "";
    let errMsg = "";

    let phpstan = child_process.spawn(
      this.makeCommandPath(cwd),
      this.makeCommandArgs(args),
      this.setCommandOptions(cwd)
    );
    phpstan.stderr.on("data", (data) => {
      errMsg += data.toString();
    });
    phpstan.stdout.on("data", (data) => {
      result += data.toString();
    });

    phpstan.on("exit", (code) => {
      this._analyzing = false;
      this._statusBarItem.show();

      if (stats.isFile()) {
        this._diagnosticCollection.delete(Uri.file(originalPath || thePath));
      }

      if (code === 0) {
        // no error
        this._statusBarItem.text = "[phpstan] passed";
      } else if (errMsg) {
        // phpstan failed
        this._statusBarItem.text = "[phpstan] failed";
        window.showErrorMessage('It seems something wrong with PHPStan: '+errMsg);
      } else if (result) {
        // phpstan error
        const index = result.indexOf('{"totals":');
        if (index > -1) {
          result = result.substring(index);
        }
        const data = JSON.parse(result);
        this.setDiagnostics(data, originalPath || thePath);
        this._statusBarItem.text = "[phpstan] error " + data.totals.file_errors;
      } else {
        this._statusBarItem.text = "[phpstan] unknown";
      }
    });
  }

  protected makeCommandPath(cwd: string) {
    let binDir = "vendor/bin";
    const baseName = process.platform === "win32" ? "phpstan.bat" : "phpstan";
    try {
      binDir = child_process
        .execSync("composer config bin-dir", { cwd })
        .toString()
        .trim();
    } catch (err) {}
    const binary = path.resolve(cwd, binDir, baseName);
    try {
      fs.accessSync(binary, fs.constants.X_OK);
      return binary;
    } catch (err) {
      return this._phpstan;
    }
  }

  protected makeCommandArgs(args: PhpStanArgs) {
    let result: string[] = [];
    result.push("analyse");
    result.push("--error-format=json");
    if (args.level === "config") {
      // set level in config file
    } else if (args.level) {
      result.push("--level=" + args.level);
    } else {
      result.push("--level=max");
    }
    if (args.noProgress) {
      result.push("--no-progress");
    }
    if (args.memoryLimit) {
      result.push("--memory-limit=" + args.memoryLimit);
    }
    if (args.configuration) {
      result.push("--configuration=" + args.configuration);
    }
    if (args.autoloadFile) {
      result.push("--autoload-file=" + args.autoloadFile);
    }
    if (args.path) {
      result.push(args.path);
    }
    return result;
  }

  protected setCommandOptions(cwd: string) {
    let result: { cwd?: string } = {};
    if (cwd) {
      result.cwd = cwd;
    }
    return result;
  }

  protected getCurrentWorkPath(baseDir: string) {
    let workPath = "";
    let similarity = 0;
    let folders = workspace.workspaceFolders;
    if (folders) {
      folders.forEach((el, i) => {
        if (
          el.uri.fsPath.length > similarity &&
          baseDir.indexOf(el.uri.fsPath) === 0
        ) {
          workPath = el.uri.fsPath;
          similarity = workPath.length;
        }
      });
      return workPath;
    }
    return "";
  }

  protected downFindRealWorkPath(baseDir: string) {
    return this.tryFindRealWorkPath(
      baseDir,
      ["src", "source", "sources"],
      ["phpstan.neon", "phpstan.neon.dist", "vendor/autoload.php"]
    );
  }

  protected tryFindRealWorkPath(
    baseDir: string,
    dirs: string[],
    targets: string[]
  ) {
    let workPath;
    let tempPath;
    for (let i in dirs) {
      workPath = path.join(baseDir, dirs[i]);
      if (fs.existsSync(workPath)) {
        for (let j in targets) {
          tempPath = path.join(workPath, targets[j]);
          if (fs.existsSync(tempPath)) {
            return workPath;
          }
        }
      }
    }
    return "";
  }

  protected upFindAutoLoadFile(baseDir: string) {
    let baseName: string;
    let parentName: string;
    let autoLoadFilePath: string;
    baseName = baseDir;
    parentName = path.dirname(baseName);
    autoLoadFilePath = path.join(baseName, "vendor/autoload.php");
    while (1) {
      if (fs.existsSync(autoLoadFilePath)) {
        return autoLoadFilePath;
      } else if (baseName === parentName) {
        return "";
      } else {
        baseName = parentName;
        parentName = path.dirname(baseName);
        autoLoadFilePath = path.join(baseName, "vendor/autoload.php");
      }
    }
  }

  protected upFindConfiguration(baseDir: string) {
    let baseName: string;
    let parentName: string;
    let config1: string;
    let config2: string;
    baseName = baseDir;
    parentName = path.dirname(baseName);
    config1 = path.join(baseName, "phpstan.neon");
    config2 = path.join(baseName, "phpstan.neon.dist");
    while (1) {
      if (fs.existsSync(config1)) {
        return config1;
      } else if (fs.existsSync(config2)) {
        return config2;
      } else if (baseName === parentName) {
        return "";
      } else {
        baseName = parentName;
        parentName = path.dirname(baseName);
        config1 = path.join(baseName, "phpstan.neon");
        config2 = path.join(baseName, "phpstan.neon.dist");
      }
    }
  }
}
