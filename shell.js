var fs = require('fs');
var path = require('path');
var acorn = require("acorn");
var inquirer = require('inquirer');
var chalk = require('chalk');
require('acorn-stage3/inject')(acorn);

var shell = {
  root: path.resolve(),

  prompt: function () {
    var _this = this;

    inquirer.prompt([{
      type: 'input',
      message: '请输入文件名（基于当前相对路径）:',
      name: 'file'
    }]).then(function(answers) {
      var searchFile = path.resolve(_this.root, answers.file);
      var files = _this.walkFile(_this.root, searchFile);
      var char = _this.getConsoleChar('-', 40);

      console.info('');
      console.info(chalk.green(char));
      console.info('');
      files.forEach(function (file) {
        console.info(chalk.cyan(' - ' + path.relative(_this.root, file)));
      });
      console.info('');
      console.info(chalk.green(char));
      console.info('');
    });
  },

  // 获取输出字符
  getConsoleChar: function (char, length) {
    char = char || '-';
    length = length || 86;

    var str = '';
    for (var i = 0; i < length; i++) {
      str += char;
    }

    return str;
  },

  walkFile: function (dir, searchFile) {
    var _this = this;
    // 取得 js 文件
    var files = this.findJsFile(dir);
    var filesHit = [];

    files.forEach(function (file) {
      var filepath = path.dirname(file);
      var res = _this.walkAst(file, filepath, searchFile);
      if (res) {
        //是否在 page 目录下
        if (filepath === path.resolve(_this.root, 'page')) {
          if (filesHit.indexOf(file) === -1) {
            filesHit.push(file);
          }
        } else {
          var sonFilesHit = _this.walkFile(dir, file);
          sonFilesHit.forEach(function (item) {
            if (filesHit.indexOf(item) === -1) {
              filesHit.push(item);
            }
          });
        }
      }
    });

    return filesHit;
  },

  // 查找 js 文件
  findJsFile: function (dir) {
    var _this = this;
    var files = fs.readdirSync(dir);
    var jsFiles = [];

    files.forEach(function (file) {
      var absoluteFile = path.resolve(dir, file);
      var stat = fs.statSync(absoluteFile);

      if (stat.isFile()) {
        // 获取后缀
        var extname = path.extname(absoluteFile);
        if (extname === '.js') {
          jsFiles.push(absoluteFile);
        }
      } else if (stat.isDirectory()) {
        if (file !== 'node_modules') {
          var sonJsFiles = _this.findJsFile(absoluteFile);
          jsFiles = jsFiles.concat(sonJsFiles);
        }
      }
    });

    return jsFiles;
  },

  // 执行 AST，判断是否包含想要的代码
  walkAst: function (file, filepath, searchFile) {
    var code = fs.readFileSync(file);
    var ast = this.parseAst(code);

    for (var i = 0, len = ast.body.length; i < len; i++) {
      var token = ast.body[i];
      var dep = this.parseToken(token);

      if (dep) {
        var absoluteFile = path.resolve(filepath, dep);
        if (absoluteFile === searchFile) {
          return true;
        }
      }
    }

    return false;
  },

  // AST 解析
  parseAst: function (code) {
    code = code.toString();
    return acorn.parse(code, {
      ecmaVersion: 10,
      sourceType: 'module',
      plugins: {
        stage3: true
      }
    });
  },

  // 解析 token
  parseToken: function (token) {
    // example: require('./test.js');
    if (
      token.type === 'ExpressionStatement' &&
      token.expression.type === 'CallExpression' &&
      token.expression.callee.name === 'require'
    ) {
      var dep = token.expression.arguments[0];
      return dep.value;
    }

    // example: var test = require('./test.js');
    if (token.type === 'VariableDeclaration') {
      var init = token.declarations[0].init;

      if (init.type === 'CallExpression' && init.callee.name === 'require') {
        var dep = init.arguments[0];
        return dep.value;
      }
    }

    // example: import test from './test.js'
    if (token.type === 'ImportDeclaration') {
      var source = token.source;
      return source.value;
    }
  }
};

shell.prompt();
