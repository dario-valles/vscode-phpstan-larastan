# VSCode PhpStan README

A vscode extension for [phpstan](https://github.com/phpstan/phpstan) and [larastan](https://github.com/nunomaduro/larastan).

A modified version of the great work of [breeze2](https://github.com/breeze2/vscode-phpstan)

I made made my own version this extension because I need a plug and play extension that works with live type checking and only required conf is to have installed phpstan and larastan to work with Laravel projects.

## Features

Type checking while you write

auto lint your php code, or use the command:

* `PhpStan: Lint this file`
* `PhpStan: Lint this folder`

## Requirements

* php >= 7.1
* phpstan >= 0.11
If in Laravel project:
* larastan 0.7.11

### If using Laravel: Install larastan

```bash
composer require --dev nunomaduro/larastan
```
Create phpstab.neon on working directory and ad the following
```code
  includes:
      - ./vendor/nunomaduro/larastan/extension.neon
  parameters:
      paths:
          - app
      level: 5
      ignoreErrors:
      checkMissingIterableValueType: false
```

### If not

```bash
composer require --dev phpstan/phpstan
```
or
```bash
composer require global phpstan/phpstan
````

## Extension Settings

For example:

This extension contributes the following settings:

* `phpstan.level`: rule levels 0-7, default max
* `phpstan.noProgress`: no progress output, default true
* `phpstan.memoryLimit`: memory limit, default 512M
* `phpstan.configuration`: path of configuration
* `phpstan.autoloadFile`: path of autoload file, default vendor/autoload or null
* `phpstan.liveErrorTracking`: Enable or disable live error tracking, default true
* `phpstan.debounce`: Debounce time when live error tracking enabled, default true
* `phpstan.tmpPath`: path to temporary folder, default system tmp folder

## Known Issues

* May need more memory when linting too many files

## Improving performance
### Debounce option
Depending on the speed of your computer and the size of your project you could reduce debounce to 1000 or 500ms so you will have faster type checking.

### Create a RAM DISK

For live type checking as this extension does not use a server we need to save to temporary files in order to allow phpstan to analyze current working file, so its reading and writing file every few seconds, in order to improve a little:

You can create a ram disk to enhance disk writing files speed
Example for MacOs
```bash
diskutil erasevolume HFS+ 'RAMDisk' `hdiutil attach -nobrowse -nomount ram://256000`
```
This will create a Volume on Volumes\RAMDisk
Then change on the `phpstan.tmpPath` to point to the created RAMDisk

You could also modify the phpstan.neon file to include inside parameters, this will make all cache generated by phpstan to be on the very fast RAMDisk:
```code     
tmpDir: /Volumes/RAMDisk
```

This disk is not persistent so you should create the RAMDisk on every restart (google tells you how to automatize this)
## Release Notes


### 1.0.0
* Initial release of vscode-phpstan-larastan

## Atributions
Icon by: [icon-monk](https://www.flaticon.es/autores/icon-monk)
Original work: [https://github.com/breeze2/vscode-phpstan](https://github.com/breeze2/vscode-phpstan)