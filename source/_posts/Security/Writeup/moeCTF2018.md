---
title: moeCTF2018
date: 2018-08-26
tags: 
	- CTF
	- Writeup
---

> 既然web组的人多。。那先写web？

## WEB

#### Where is the Flag?

看源代码，flag在注释里

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Title</title>
</head>
<body>
<h1>远在天边，近在眼前</h1>
<!--moectf{f12_is_th3_bAsic_way_t0_get_F1ag}-->
</body>
</html>
```

#### GET/POST

用请求工具进行get/post请求，带个flag参数

```http
GET /moectf/get/index.php?flag= HTTP/1.1
Host: 120.77.152.169:8088

```

moectf{GEt_13_the_ba5ic_method}
moectf{Post_1s_the_sEcond_Method}

#### PHP是世界上坠吼的语言

```php
$md5a = md5($a);
$md5s = md5($s);
if($s != $a && $md5a == $md5s){
    echo $flag;
}
```

php弱类型比较，常用md5:

```php
md5(‘240610708’) == md5(‘QNKCDZO’)
md5(‘aabg7XSs’) == md5(‘aabC9RqS’)
```

等等

php类型比较说明文档
PHP文件包含

?file=file.php

要读源码，加参数

`php://filter/read=convert.base64-encode/resource=flag.php`

得到
PD9waHAKLy9tb2VjdGZ7TElGXzFTX3YzcnlfRWFTeX0K

base64解码后得到flag(好叭这个flag.php是猜的)
Parse_URL

…..这是原题。
最好的语言里的parse_url()函数有个feature，当它接收到一个无法parse的url参数时会返回FALSE

> On seriously malformed URLs, parse_url() may return FALSE.

php parse_url函数文档

```php
$url = urldecode($_SERVER['REQUEST_URI']);
$url = parse_url($url, PHP_URL_QUERY);
...
if (preg_match("/\w+/i", $url))#匹配[A-Z][a-z][0-9]和下划线
{
    die("...");
}
```

false当然不是character啦啦啦啦
所以把url里头的斜杠多写几个就可以啦
然后再配上一个小小的参数就爆flag了

`?_=0`

flag是啥？不重要了

#### PHP弱类型的复仇

先干啥好呢？F12啊

```php
$pattern='/^(?=[1-9])(?=.[A-Z]).{10,12}$/';
#匹配以一个数字开头，紧跟一个大写字母的长度为10-12的串
$gugugu=$_GET['gugugu'];
if (preg_match($pattern, $gugugu)===0) {
    echo "正则看懂了嘛";#看懂啦
}
else{
    $secret="******";
    if ($gugugu==$secret) {
        echo "tqdl，给师傅递flag<br>".$flag;
    }
}
```

。
这道题。。。。ORZ dalao。。。关键在于“以一个数字开头，紧跟一个大写字母的长度为10-12的串”如何表示一个数字，构造一个弱类型比较。
0x?小写。pass
然后我就智障了
1*100000000的计算结果?
哦

`?gugugu=6E00000000`

#### 不会的题

不会的题写什么wp

#### 白名单过滤xss

哦

> runtime error? reverse engineering?

## RE

入场前请检查您是否带着您的毛(i)巾(da)

#### re1

拖到ida里

找不到flag？View->Open Subviews->Strings

#### re2

拖到ida里

Strings里找不到flag？实现一下F5出来的逻辑，反过来写一遍(实现一下反函数)

`moectf{Qidao_by_fa1con}`

#### py逆向
	
```sh
git clone https://github.com/wibiti/uncompyle2.git
cd uncompyle2
python setup.py install
cd ..
uncompyle py.pyc
```

然后同re2
	
```cpp
#include<iostream>
#include<string>
using namespace std;
string orig="bX;oY4Tpe4D8Q2;VRW:{U2;IQIP8fR?@";
int main(){
    for(int i=0;i<orig.size();i++)
        orig[i]-=i%4;
    
    cout<<orig;
}
```
base64一下
`moectf{pyC_RE_1S_E@sy}`

#### 玩过2048么？

那当然是玩过啦

但是玩不到4096怎么办啊…
那当然是修改器啦

用八门神器(误)IDA找到4096(1000h)改成16(10h)

## CRYPTO

#### Open the door of Crypto

熟练使用openssl
熟练使用factordb
熟练使用notepad

#### ECB_Attack

* AES背景知识

AES是一种”对称加密”方式，与以RSA为代表的”非对称加密”相对，用同一个密钥进行加密和解密。AES分多种加密模式，其中ECB模式是最简单最易实现的一种。带来便利性的同时，ECB也有一些小缺陷，在某些时候，如果使用不当，AES-ECB有可能带来巨大的灾难。

* ECB加密过程

进行ECB加密时，首先要将字符串分割成相等的几部分(称为block)。为方便表示，此处以3个字符为一个block进行演示，不展示密钥对明文加密的过程。

做出以下假设：
|明文| 	密文|
|-|-|
|aaa|ciph1|
|aab|ciph2|
|aba|ciph3|
|bba|ciph4|

这时当我们对字串

`aaaaaa`

进行加密时，便可以得到密文

`ciph1ciph1`

ECB的缺陷何在?
> ECB的每个block前后文不相关，即每个block单独加密，不与其他block相呼应

实行一次攻击的条件：
* 攻击方能够控制字串一定部分的长度
* 攻击方了解需要获取的信息目标之前的一段信息
* 攻击方已知字串以某一未知密钥加密后的密文
* 攻击方能够多次数获取某一字符串以相同密钥加密后的密文

假设我们能控制从某一字符串开始处的内容长度，并且了解到字符串的结构为

`[controllable]aaa[target],block=3`

当我们控制`[controllable]`部分为`bb`时，字符串为

`bbaaa[target]`

切分block后为

`bba 	aa[target_0] 	[target_1-end]`

现在我们已知整个字符串的密文为

`ciph4ciph2ciph5`

则通过尝试对第二个block进行填充并加密可以试出target_0的值为b
现缩短[controllable]部分长度，更改为"b",则字串变为


`baaa[target]`

`baa 	a[target_0][target_1] 	[target_2-end]`

此时已知第二个block的内容为”ab[target_1]”，再次尝试可以获得target第二位的值
现更改[controllable]部分为”bbbb”,字串切分后为
```
bbb 	baa 	a[target_0][target_1] 	[target_2-end]
```

其效果与`[controllable]="b"`相当,但给我们留下了更多的缩短余地。

* 回到原题

通过多次尝试，不难发现字符串每16个字符划分一个block，作者又给了我们源代码以供参考，连接到服务器后发送来的消息中包含了flag。我们需要控制name长度来”缩”出来flag

`hello, [name], your mission's flag is: [flag]`

于是我们可以写个python来跑，然而我太弱了不会python，CinCPP将就着看吧
	
```cpp
#include<WinSock2.h>
#include<iostream>
#include<cstdio>
#include<string>
#include<cstring>
#pragma comment(lib,"Ws2_32.lib ")
using namespace std;
namespace ECB_Atack {
	SOCKET server;
	bool read(string &i) {
		char buffer[2048];
		memset(buffer, 0, sizeof buffer);
		if (recv(server, buffer, sizeof(buffer), 0) == SOCKET_ERROR) {
			closesocket(server);
			WSACleanup();
			cout << "read error";
			exit(0);
		}
		i = buffer;
		if (i.size())return true;
		return false;
	}
	void put(string m) {
		if (m[m.size() - 1] != '\n')m += '\n';
		cout << "[message send]" << m;

		if (send(server, m.c_str(), m.size(), 0) == SOCKET_ERROR) {
			closesocket(server);
			WSACleanup();
			cout << "put error";
			exit(0);
		}
		Sleep(150);
	}
	string expect_reply(string message) {
		put(message);
		read(message);
		return message;
	}

	char visible_char[] = 
		" 0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!\"#$%&\\\'()*+,-./:;<=>?@[\\]^_`{|}~";

	string banner_encrypted;
	string flag_uncovered;
}

int ECB_Atack_main() {
	WSAData wd;
	(WSAStartup(MAKEWORD(2, 2), &wd));

	string message;
	string name;
	for (int i = 30; i > 0; i--) {//30=14+16
		ECB_Atack::server = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
		SOCKADDR_IN addrServ;
		addrServ.sin_family = AF_INET;
		addrServ.sin_port = htons(9997);
		addrServ.sin_addr.S_un.S_addr = inet_addr("123.56.218.81");
		int ret = connect(ECB_Atack::server, (SOCKADDR*)&addrServ, sizeof(SOCKADDR));
		if (SOCKET_ERROR == ret) {
			printf("socket connect failed\n");
			WSACleanup();
			closesocket(ECB_Atack::server);
			return -1;
		}
		name = "";
		for (int j = 0; j < i; j++)name += 'a';
		ECB_Atack::read(message);
		ECB_Atack::put(name);
		ECB_Atack::read(message);
		string encrypted_banner = message.substr(0, message.find("\n"));

		string constructed_banner = "hello, " + name + ", your mission's flag is: ";
		int known_bits = constructed_banner.size() % 16;//block size

		//check valid;
		ECB_Atack::put(constructed_banner.substr(0, 16));
		ECB_Atack::read(message);
		message = message.substr(0, message.find("\n"));
		if (encrypted_banner.find(message) == -1)
			assert("what the...");

		//jump to last block
		string last_block = 
			constructed_banner.substr(16 * int(constructed_banner.size() / 16));
		string payload = last_block + ECB_Atack::flag_uncovered;

		for (int i = 0; i < 96; i++) {
			ECB_Atack::put(payload + ECB_Atack::visible_char[i]);
			ECB_Atack::read(message);
			message = message.substr(0, message.find("\n"));
			if (encrypted_banner.find(message)!=-1) {
				ECB_Atack::flag_uncovered += ECB_Atack::visible_char[i];
				break;
			}
		}
		closesocket(ECB_Atack::server);
	}
	cout << ECB_Atack::flag_uncovered;
	
	WSACleanup();
}
```

## MISC

#### BASE64

如题目要求，将文本进行base64解码即可得到flag

> 题外话：熟悉base64,32,16编码的过程对RE帮助极大

#### 凯撒密码

> 密码学(?)的鼻祖(?)凯撒将凯撒密码用于战争中的密令传递，开辟了(???)新的战争空间(胡诌)

将每一位拉丁字母按a-z的顺序向后推即可
遇到题目中没有给出密钥的情况。。。可以把26种可能全打出来找合理的

####栅栏密码

错位重组
遇到栅栏密码加密过的字符串s时可以优先尝试密钥divisor(|s|),其中divisor(x)表示的因数

#### zip伪加密

先修复加密位，将单数改成双数(00)
修复了加密位的我一脸懵逼，直到我向shell里输入了

```
binwalk zip
```

欸。。。怎么没有zip头。。。
修复zip头，拿flag

#### backdoor

流量分析
看到50 4B的那一刻就跳起来了

#### 弄脏的二维码

修复定位符，剩下的交给QR code的容错
#### 蒙娜丽圆的微笑

emmmmm
小圆圆！小圆圆！
拿ps或者其他什么逐帧浏览
#### miku’s secret

收集隐写工具大比拼
这个工具
lsb隐写，密钥在二维码里

## PPC

emmmmm 这PPC跟我想象的不太一样啊

#### BAT

无脑编程题，没本事拿bat解。
#### Cirno

本来特别兴奋，多年闲置着的计算表达式的值的函数终于派上用场了，结果人家py自带计算表达式的值。
不管不管嘤嘤嘤我就拿 C in CPP

```cpp
#include<WinSock2.h>
#include<iostream>
#include<cstdio>
#include<string>
#include<stack>
#include<algorithm>
#pragma comment(lib,"Ws2_32.lib ")
using namespace std;
stack<char>operators;
stack<int> operands;

bool process() {
	char operation = operators.top();
	operators.pop();
	int a = operands.top(); operands.pop();
	int b = operands.top(); operands.pop();
	switch (operation) {
	case '+':
		operands.push(a + b);
		break;
	case '-':
		operands.push(b - a);
		break;
	case '*':
		operands.push(a*b);
		break;
	case '/':
		if (a == 0) return false;
		if (b%a)return false;//不能整除的话与咸鱼何异
		operands.push(b / a);
	}
	return true;
}
int cal(string expr) {
	while (!operators.empty())operators.pop();
	while (!operands.empty())operands.pop();
	for (int i = 0; i < expr.length(); i++) {
		if (expr[i] == ' ')continue;
		if (expr[i] == '+' || expr[i] == '-') {
			char temp;
			while (!operators.empty() &&
				((temp = operators.top()) == '+' || temp == '-' || temp == '*' || temp == '/'))
				if (process() == false)return -1;
			operators.push(expr[i]);
		}
		else if (expr[i] == '*' || expr[i] == '/') {
			char temp;
			while (!operators.empty() &&
				((temp = operators.top()) == '*' || (temp = operators.top()) == '/'))
				if (process() == false)return -1;
			operators.push(expr[i]);
		}
		else {
			int num = 0;
			while (i<expr.length() && expr[i] >= '0'&&expr[i] <= '9') {
				num *= 10;
				num += expr[i] - '0';
				i++;
			}
			i--;
			operands.push(num);
		}
	}
	while (operands.size() > 1)if (process() == false)return -1;
	return operands.top();
}
char to_symbol(int i) {
	switch (i) {
	case 0:return '+';
	case 1:return '-';
	case 2:return '*';
	case 3:return '/';
	}
	return 0;
}

SOCKET server;
bool read(string &i) {
	char buffer[2048];
	memset(buffer, 0, sizeof buffer);
	if (recv(server, buffer, sizeof(buffer), 0) == SOCKET_ERROR) {
		closesocket(server);
		WSACleanup();
		cout << "read error";
		exit(0);
	}
	i = buffer;
	if (i.size())return true;
	return false;
}
void put(string &m) {
	cout << "sent:" << m << endl;
	if (send(server, m.c_str(), m.size(), 0) == SOCKET_ERROR) {
		closesocket(server);
		WSACleanup();
		cout << "put error";
		exit(0);
	}
}
int main() {
	WSAData wd;
	/*assert*/(WSAStartup(MAKEWORD(2, 2), &wd));
	server = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
	SOCKADDR_IN addrServ;
	addrServ.sin_family = AF_INET;
	addrServ.sin_port = htons(9998);
	addrServ.sin_addr.S_un.S_addr = inet_addr("123.56.218.81");
	int ret = connect(server, (SOCKADDR*)&addrServ, sizeof(SOCKADDR));//开始连接
	if (SOCKET_ERROR == ret) {
		printf("socket connect failed\n");
		WSACleanup();
		closesocket(server);
		return -1;
	}

	string in;
	while (read(in)) {
		
		if (in.find("moectf")!=-1) {
			system("cls");
			cout << "flag found:" << in << endl;
			break;
		}
		
		cout << in;
		int fl = in.size(); while (in[fl] != ':')fl--;
		in = in.substr(fl, in.size() - fl);

		int arr[4];
		sscanf(in.c_str(), ":%d, %d, %d, %d", &arr[0], &arr[1], &arr[2], &arr[3]);

		while (prev_permutation(arr, arr + 4));
		next_permutation(arr, arr + 4);

		while (next_permutation(arr, arr + 4)) {
			for (int i = 0; i<4; i++)
				for (int j = 0; j<4; j++)
					for (int k = 0; k < 4; k++) {
						string exp = to_string(arr[0]) + to_symbol(i) +
							to_string(arr[1]) + to_symbol(j) +
							to_string(arr[2]) + to_symbol(k) +
							to_string(arr[3]);
						//cout << exp;
						if (cal(exp) == 9) {
							put(exp);
							goto end;
						}
					}
		}
	end:;
	}
	closesocket(server);
	WSACleanup();
}
```