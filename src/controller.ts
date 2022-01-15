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
import { debounce } from "throttle-debounce";
import * as tempDirectory from "temp-dir";
import * as child_process from "child_process";
import * as path from "path";
import { writeFileSync, existsSync, statSync, constants, accessSync } from "fs";
import { platform } from "process";

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
  tmpPath?: string;
}

export class PhpStanController {
  private _analyzing: boolean = false;
  private _phpstan: string = "phpstan";
  private _diagnosticCollection: DiagnosticCollection;
  private _disposable: Disposable;
  private _statusBarItem: StatusBarItem;
  private _commandForFile: Disposable;
  private _commandForFolder: Disposable;
  private _config: PhpStanArgs = {};
  public version = 0;

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
        const version = e.textEditor.document.version;
        if (this.version === version) {
          return
        }
        this.version = version;
        if (
          !this._config.liveErrorTracking ||
          e.textEditor.document.languageId != "php"
        ) {
          return;
        }
        const editor = window.activeTextEditor;
        if (editor) {
          const documentText = editor.document.getText();
          const originalPath = editor.document.uri.path;
          const originalName = editor.document.fileName.split("/").slice(-1);
          window.showInformationMessage("" + this._config.tmpPath);
          const document = {
            fileName: `${
              this._config.tmpPath || tempDirectory
            }/${originalName}`,
            isClosed: false,
            languageId: "php",
          };
          writeFileSync(document.fileName, documentText);
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
    const phpstanPath = existsSync("vendor/bin/phpstan")
      ? vendorPath
      : "phpstan";
    this._phpstan = platform === "win32" ? "phpstan.bat" : phpstanPath;
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
    this._config.level = workspace_config.get("phpstan.level", 5);
    this._config.memoryLimit = workspace_config.get(
      "phpstan.memoryLimit",
      "1G"
    );
    this._config.noProgress = workspace_config.get("phpstan.noProgress", true);

    const autoloadPath = "vendor/autoload.php";
    this._config.autoloadFile = workspace_config.get(
      "phpstan.autoloadFile",
      existsSync(autoloadPath) ? autoloadPath : undefined
    );
  }

  private _shouldAnalyseFile(document?: any, originalPath?: string) {
    if (!document?.fileName || !originalPath) {
      if (!this._editor()) return;
      document = this._editor()?.document;
    }
    document.languageId === "php"
      ? this.analyseFile(document.fileName, originalPath)
      : this._statusBarItem.hide();
  }

  private _editor = () => window.activeTextEditor;

  private _shouldAnalyseFolder(resource: any) {
    if (resource?.fsPath) {
      return this.analyseFolder(resource.fsPath);
    }

    const editor = window.activeTextEditor;

    return editor
      ? this.analyseFolder(path.dirname(editor.document.fileName))
      : this._statusBarItem.hide();
  }

  public analyseFile(file: string, originalPath?: string) {
    this.analyse(file, originalPath);
  }

  public analyseFolder(dir: string) {
    this.analyse(dir);
  }

  protected setDiagnostics(data: PhpStanOutput, originalPath: string) {
    if (data.files) {
      const editor = window.activeTextEditor;
      const document: TextDocument | null = editor ? editor.document : null;
      for (const file in data.files) {
        const output_files = data.files[file];
        const output_messages = output_files.messages;
        const diagnostics: Diagnostic[] = [];
        const uri = Uri.file(originalPath || file);
        const uri_string = uri.toString();

        this._diagnosticCollection.delete(uri);

        output_messages.forEach((el) => {
          const line = (el.line || 1) - 1;
          let range: Range;
          const message = el.message;
          if (document?.uri.toString() === uri_string) {
            range = new Range(
              line,
              0,
              line,
              document.lineAt(line).range.end.character + 1
            );
            const text = document.getText(range);
            const result = /^(\s*).*(\s*)$/.exec(text);
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
    const args: PhpStanArgs = { ...this._config };
    const stats = statSync(thePath);
    const baseDir: string = stats.isFile()
        ? path.dirname(thePath)
        : stats.isDirectory()
        ? thePath
        : "";
    const projectPath = workspace?.workspaceFolders?.[0].uri.fsPath || "";
    let cwd: string = "";

    args.path = thePath;

    if (!args.configuration) {
      args.configuration = this.upFindConfiguration(projectPath);
    }

    if (!args.autoloadFile) {
      args.autoloadFile = this.upFindAutoLoadFile(projectPath);
    }

    if (!cwd && stats.isDirectory()) {
      cwd = this.downFindRealWorkPath(baseDir);
    }

    if (args.configuration && args.autoloadFile) {
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
        this._statusBarItem.text = "[phpstan] passed";
      } else if (errMsg) {
        // phpstan failed
        this._statusBarItem.text = "[phpstan] failed";
        window.showErrorMessage(
          "It seems something wrong with PHPStan: " + errMsg
        );
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
    const baseName = platform === "win32" ? "phpstan.bat" : "phpstan";
    try {
      binDir = child_process
        .execSync("composer config bin-dir", { cwd })
        .toString()
        .trim();
    } catch (err) {}
    const binary = path.resolve(cwd, binDir, baseName);
    try {
      accessSync(binary, constants.X_OK);
      return binary;
    } catch (err) {
      return this._phpstan;
    }
  }

  protected makeCommandArgs(args: PhpStanArgs) {
    const result: string[] = ["analyse", "--error-format=json"];
    const argsLevel = this.getArgsLevel(args?.level);

    argsLevel && result.push(argsLevel);
    args.noProgress && result.push("--no-progress");
    args.memoryLimit && result.push("--memory-limit=" + args.memoryLimit);
    args.configuration && result.push("--configuration=" + args.configuration);
    args.autoloadFile && result.push("--autoload-file=" + args.autoloadFile);
    args.path && result.push(args.path);

    return result;
  }

  protected getArgsLevel(level: string | number | undefined): string | null {
    if (level === "config") return null;
    return level ? "--level=" + level : "--level=max";
  }

  protected setCommandOptions(cwd: string) {
    return { cwd };
    // let result: { cwd?: string } = {};
    // if (cwd) {
    //   result.cwd = cwd;
    // }
    // return result;
  }

  protected getCurrentWorkPath(baseDir: string) {
    let workPath = "";
    let similarity = 0;
    const folders = workspace.workspaceFolders;

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
    }
    return workPath;
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
      if (existsSync(workPath)) {
        for (let j in targets) {
          tempPath = path.join(workPath, targets[j]);
          if (existsSync(tempPath)) {
            return workPath;
          }
        }
      }
    }
    return "";
  }

  protected upFindAutoLoadFile(baseDir: string) {
    const autoLoadFilePath = path.join(baseDir, "vendor/autoload.php");

    return existsSync(autoLoadFilePath) ? autoLoadFilePath : "";
  }

  protected upFindConfiguration(baseDir: string) {
    const config1 = path.join(baseDir, "phpstan.neon");
    const config2 = path.join(baseDir, "phpstan.neon.dist");

    if (existsSync(config1)) {
      return config1;
    }
    if (existsSync(config2)) {
      return config2;
    }

    return "";
  }
}
