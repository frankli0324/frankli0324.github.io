---
title: Osu逆向过程中的一些小结
date: 2020-02-07 17:04:59
tags:
---

由于MacOS Catalina上32bit程序惨遭抛弃，最近一段时间实在没动力为了玩osu!而重启电脑切Windows，于是最近几周在逆旧版的osu!，试图搞清楚关于player point统计、聊天室协议等一系列实现。由于逆的过程中碰到了一些关于微软roslyn的具体实现的问题，刚好这玩意开源。读了读一些代码，就觉得有些东西挺值得写写的。

## 目录

* Display Class 与 lambda
* Backing Field 与 getter/setter
* CompilerGeneratedAttribute 与 ILSpy
* 临时变量
* `(CS$)?<(.+)>([0-9a-s]__.*)([0-9]*)?`

## Display Class 与 lambda

在C#中，一个 lambda function 的语法如下：

```csharp
// in some function
(parameter1, parameter2) => {
    return do_something(parameter1, parameter2);
}
(parameter1, parameter2) => do_something(parameter1, parameter2);
```

在利用网上的各种工具对 osu! 进行反混淆后，先拿 dnSpy 调一调，发现 osu 对文件的哈希进行了比较复杂的认证，索性直接丢到 ILSpy 里头。（具体步骤参考[osu-reversed](https://github.com/frankli0324/osu-reversed)）  
看了看反编译出来的文件，发现里头有很多非法的符号名，最显眼的就是`<>c_DisplayClass`。这个`DisplayClass`就非常的让人摸不着头脑，遂谷歌

`anonymous method closure class`

为了弄清楚`DisplayClass`到底是什么东西，先得了解几个概念


打开维基百科*，一句一句地看

> *注：英文。维护维基中文的一帮人就是群憨批。

### 作用域

> In programming languages, a closure, also lexical closure or function closure, is a technique for implementing **lexically scoped** name binding in a language with first-class functions. 

平常总是说作用域作用域什么的，好像都能理解。但是一说到定义就很模糊了。恰巧，要深刻理解闭包，正要深刻理解作用域，这里就稍稍明晰一下作用域的概念

此处尝试写了点东西，发现自己说得不太清楚，还是放几个传送门把。
看的时候不要以“js是这么干的”或者“python是这么干的”这么想，要以“编程是这么干的”这种思路看。

[Scope](https://en.wikipedia.org/wiki/Scope_(computer_science)#Lexical_scope_vs._dynamic_scope)
[YouDontKnowJS](https://github.com/getify/You-Dont-Know-JS/blob/1st-ed/scope%20%26%20closures/ch1.md#enginescope-conversation)

关于词法作用域与动态作用域再说一点。同样举个🌰
```python
# 在某一变量b的作用域内，不管它是全局变量还是啥 
def f(a):
    return a+b

c = 5
f(c)
```
对于函数`f`的**定义**来说，b的这个作用域就是“词法作用域”，而对于函数`f`的**调用**`f(c)`来说，c的这个作用域就是“动态作用域”。
其实顾名思义，词法作用域是词法决定的，动态作用域是运行时决定的，这句话说得挺准确的，但是的确不太好理解。

Q: “`f(c)`不也是程序编写的时候就写好的🐎？”A: “它不是**词法**决定的”

### 自由变量

> Operationally, a closure is a record storing a function together with an environment. The environment is a mapping associating each free variable of the function (variables that are used locally, but defined in an enclosing scope) with the value or reference to which the name was bound when the closure was created.

从这句话中，我们看到了“free variable”一词。我们用python实例来说明“free variable”
```python
In [1]: def f(a): 
   ...:     def g(b): 
   ...:         return a+b 
   ...:     return g 
   ...:

In [2]: f(1)(2)
Out[2]: 3
```
除去函数，这里涉及到了`a`, `b`两个变量。对于函数`f`来说，`a`是它的参数，但函数`g`却完全在`a`的作用域（此处即函数`f`的函数体）内。此时，`g`的自由变量就是`a`。
回头看一眼"free variable"的wiki：In computer programming, the term **free variable** refers to variables used in a function that are neither local variables nor parameters of that function. The term non-local variable is often a synonym in this context.

举一个极端点的例子：
```python
def f(a):
    def g(b):
        use a
        def h(c):
            use a and b
            def i(d):
                use a and b and c
                def j(e):
                    use d
                    ...
```
对于`g`来说`a`是自由变量，而对于`f`不是；对于`h`来说`a`、`b`是自由变量，而对于`g`来说`b`不是；对于`i`来说`a`、`b`、`c`是自由变量等等等等等。

### 闭包

> Unlike a plain function, a closure allows the function to access those captured variables through the closure's copies of their values or references, even when the function is invoked outside their scope.

如果明白了上面的，也就好理解这句话了。它们已经在闭包内了。你要有一个闭包，就必有前面的哪些自由变量。这个闭包又必在这些自由变量的作用域内。我们再看上面的话，不就是在说`闭包就是一个用到了不是局部变量的函数`罢了。

> 闭包一词经常和匿名函数混淆。这可能是因为两者经常同时使用，但是它们是不同的概念。

> 定义域？作用域？

> 感觉说了一堆废话就为了说一个挺直白的概念

### 匿名函数

理解了闭包，我们再来看匿名函数。
一个匿名函数是否构成闭包，取决于它**有没有捕获外部变量**。如何理解呢？那就先请出主角：rosyln

那么，清楚了闭包的概念，rosyln是如何处理闭包的呢？这就是`DisplayClass`上来的地方了。

> 根据StackOverflow上的某个答案（翻不到了，Chrome tab开太多了），`DisplayClass`是rosyln的一个命名失误。它本来应该叫`ClosureClass`
> ~~憨批Microsoft~~  Microsoft NB

也就是说，rosyln试图将所有的闭包都单独放到一个类中，给它们创建单独的作用域环境。如此以来，只要找到这个闭包使用到的所有自由变量，在运行时（动态作用域下）将这些自由变量放到这个新的类里头，就可以轻松地给C#加上闭包的支持。
> 为什么说“加上”呢？C#2.0正式支持匿名函数，C#3.0支持lambda，而Local Functions直到C#7.0才支持，也就是可以说C#2.0正式支持了闭包。
> From Microsoft docs: C# version 2.0 introduced the concept of anonymous methods, which allow code blocks to be passed as parameters in place of a separately defined method. C# 3.0 introduced lambda expressions as a more concise way of writing inline code blocks. Both anonymous methods and lambda expressions (in certain contexts) are compiled to delegate types. Together, these features are now known as anonymous functions. For more information about lambda expressions, see Lambda expressions.

我们来做一些实验：

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;

namespace Test {
    public class Program {
        public static void Main () {
            Action f = () => { return; };
            f ();
            Assembly asm = Assembly.GetAssembly (typeof (Program));
            IList<Type> classes = asm.GetTypes ()
                .Where (x => x.IsClass)
                .ToList ();
            foreach (var i in classes) Console.WriteLine (i);
        }
    }
}
/*
Test.Program
Test.Program+<>c
*/
```
上面的程序中创建了一个没有传入参数，没有返回值的匿名函数

由于匿名函数没有捕获其所在作用域内的任何变量，故这个函数**不构成闭包**

> <>c不是我们关心的东西

```csharp
...
        public static void Main () {
            var a = 1;
            Func<int> f = () => a;
            f ();
            Assembly asm = Assembly.GetAssembly (typeof (Program));
...
        }
    }
/*
Test.Program
Test.Program+<>c__DisplayClass0_0
Test.Program+<>c
*/
```
对上面的程序做略微的修改，这个匿名函数现在使用了在`Main`函数中的变量`a`，**构成了闭包**，同时我们能看到出现了一个名叫`Program+<>c__DisplayClass0_0`的类。

打开反编译器，让我们康康它到底是个啥。

默认情况下，ILSpy会忽略掉编译器生成的各种东西，那既然我们知道匿名函数是C#2.0出来的东西，那我们就照着C#1.0来逆，ILSpy就会不知道该咋办从而显示出来了

貌似windows上Ilspy GUI里头还有显示Compiler Generated的选项。
```bash
ilspycmd output.dll -lv CSharp1
```

```csharp
// in namespace Test :
[CompilerGenerated]
private sealed class <>c__DisplayClass0_0 {
    public int a;
    internal int <Main>b__0() {
        return a;
    }
}
// in function Main() :
Program.<>c__DisplayClass0_0 CS$<>8__locals1 = new Program.<>c__DisplayClass0_0();
CS$<>8__locals1.a = 1;
Func<int> f = new Func<int>(CS$<>8__locals1.<Main>b__0);
f();
```

可以看到，rosyln创建了一个单独的类，在运行时将自由变量赋给这个类的成员，从而实现了闭包。

btw，我们还能从上面的反编译出来的代码中推断出，对于闭包，C#采用了引用传递，而非值传递（由于变量的地址相同，反编译器把它们当作了同一个变量）。仔细思考一下，这符合描述闭包的哪一句定义？


## Backing Field 与 getter/setter



// WIP