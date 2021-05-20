---
title: WMCTF2020 PHP source analysis
date: 2020/08/05
tags:
    - CTF
    - Writeup
    - php-src
---

WMCTF 2020中[赵师傅](https://zhaoj.in)出了一道PHP源码审计 `Make PHP Great Again`。  
比赛中没有做出来，非常遗憾。

作为一个赛后诸葛亮，趁着赵师傅还没发官方分析，在此水一篇博客分析分析题目  

## 什么事require_once

as always，先看[文档](https://www.php.net/manual/en/function.require-once.php)  
`require_once`在功能上与`require`一致，只是对于任意文件都只会包含一次，而`require`在正常情况下又与`include`的功能一致。  
又到了日常骂文档的时间：`require_once`的文档告诉我们要到`include_once`的文档中查看`_once`的行为（`See the include_once documentation for information about the _once behaviour`），而`include_once`又说了几句废话带过去了（`As the name suggests, the file will be included just once.`）。8愧事PHP

## 源码分析

### Entry

很多人会误以为require/include系列是函数，然而文档都写得很清楚了它们实际上是`statement`，语句，所以它们并没有通过`PHP_FUNCTION`宏注册于PHP的函数注册表中。这样的`statement`总共只有五个，分别是`include[_once]`、`require[_once]`与`eval`。

在`Zend/zend_vm_opcodes.h`中我们可以找到，`require/include`的opcode是73

{% asset_img opcode.png ZEND_INCLUDE_OR_EVAL %}

而在`Zend/zend_vm_def`中我们可以看到

{% asset_img handler.png ZEND_VM_HANDLER %}

可以看到，这个handler的核心在于`zend_include_or_eval`，接下来我们就从这个函数开始进一步分析

### zend_include_or_eval

{% asset_img resolve.png zend_resolve_path %}

`zend_resolve_path`是php API的一部分，也就是说是动态赋值的。
很容易就会发现在`zend_startup`步骤中出现了
`zend_resolve_path = utility_functions->resolve_path_function;`
这样的语句，交叉引用看到`main.c`中：

```cpp
int php_module_startup(sapi_module_struct *sf, zend_module_entry *additional_modules, uint32_t num_additional_modules){
    zend_utility_functions zuf;
    ...
    zuf.resolve_path_function = php_resolve_path_for_zend;
    zend_startup(&zuf);
    ...
}
```

最终找到"真正"的`zend_resolve_path`函数，然后再琢磨一会才能找到`tsrm_realpath_r`，但是实际上这里正常的做法是动态调试。  
在`zend_include_or_eval`中下断点，下在`zend_resolve_path`处，单步进入，会发现实际上走到了`phar_find_in_include_path`，原因是phar拓展拦截了`zend_resolve_path`函数（装饰器设计模式）。不过没关系，我们还是fallback到了`php_resolve_path_for_zend`。  

```cpp
PHP_MINIT_FUNCTION(phar)
{
    REGISTER_INI_ENTRIES();

    phar_orig_compile_file = zend_compile_file;
    zend_compile_file = phar_compile_file;

    phar_save_resolve_path = zend_resolve_path;
    zend_resolve_path = phar_resolve_path;

    phar_object_init();

    phar_intercept_functions_init();
    phar_save_orig_functions();

    return php_register_url_stream_wrapper("phar", &php_stream_phar_wrapper);
}
```

跟啊跟，最终跟到`tsrm_realpath_r`。但是`tsrm_realpath_r`这么长不太想看怎么办？
别忘了我们是在动态调试。让我们先看看执行的效果如何

{% asset_img noexception.png what? %}

`tsrm_realpath`返回了NULL。看上去没问题，但是让我们回到`zend_include_or_eval`。按照开发者的逻辑，`tsrm_realpath`返回NULL意味着出现了问题，理应抛出一个异常（在PHP中为`execute_globals.exception`，即`EG(exception)`），然而纵观源码，此处并没有调用`zend_throw_exception`抛出异常。

所以我们直接走到了`zend_stream_open`。这时我们遇到了另一个PHP_API，参考`zend_resolve_path`，我们能够找到"真正的"`zend_stream_open`为`php_stream_open_for_zend`。可以看到它对`php_stream_open_wrapper`进行了包装，而`wrapper`又是一个指向`_php_stream_open_wrapper_ex`(main/streams/streams.c:2057)的宏

跟进来，仍然有对`zend_resolve_path`的调用

{% asset_img stream_open.png 梅开二度 %}

梅开二度，仍然返回NULL，没抛Exception。我们跟到`main/streams/plain_wrapper.c`中看文件是如何打开的：

{% asset_img open_wrapper.png %}

也就是说需要经过一次`expand_filepath`

```cpp
PHPAPI char *expand_filepath(const char *filepath, char *real_path) {
    return expand_filepath_ex(filepath, real_path, NULL, 0);
}
PHPAPI char *expand_filepath_ex(const char *filepath, char *real_path, const char *relative_to, size_t relative_to_len) {
    return expand_filepath_with_mode(filepath, real_path, relative_to, relative_to_len, CWD_FILEPATH);
}
PHPAPI char *expand_filepath_with_mode(const char *filepath, char *real_path, const char *relative_to, size_t relative_to_len, int realpath_mode) {
    ...
    if (virtual_file_ex(&new_state, filepath, NULL, realpath_mode)) {
        efree(new_state.cwd);
        return NULL;
    }
    ...
}
```

这里怎么也有个`virtual_file_ex`？我们继续走

{% asset_img expand_virtual.png %}

竟然顺利通过了。所以我们可以得出一个小结论：是`virtual_file_ex`的不一致的表现导致了这个bug。
我们进一步来探讨一下这个不一致性是怎么产生的。

### virtual_file_ex

在上面的分析中，可以看到`tsrm_realpath`与`expand_filepath`在调用`virtual_file_ex`分别是这么传参的：

```php
// tsrm_realpath
if (virtual_file_ex(&new_state, path, NULL, CWD_REALPATH)) {...}
// expand_filepath
if (virtual_file_ex(&new_state, path, NULL, CWD_FILEPATH)) {...}
```

这两个宏在源码里是这么解释的：

```cpp
#define CWD_FILEPATH 1 /* resolve symlinks if file is exist otherwise expand */
#define CWD_REALPATH 2 /* call realpath(), resolve symlinks. File must exist */
```

二者的区别在于REALPATH调用时必须**保证**文件存在，不然就会直接返回

```cpp
if (save && php_sys_lstat(path, &st) < 0) {
    if (use_realpath == CWD_REALPATH) {
        /* file not found */
        return (size_t)-1;
    }
    /* continue resolution anyway but don't save result in the cache */
    save = 0;
}
```

### lstat

等等，它是怎么判断文件是否存在的？`php_sys_lstat`是什么？

```cpp
#include <sys/stat.h>
#define php_sys_lstat lstat
```

也就是说只要`lstat(path)`小于0，PHP就会认为文件不存在，从而`virtual_file_ex(..., CWD_REALPATH)`，即`tsrm_realpath`会出问题，而`virtual_file_ex(..., CWD_FILEPATH)`虽然"找不到"这个文件，但仍然会返回一个合法的路径。
我们再仔细看看[lstat在什么情况下会报错](https://linux.die.net/man/3/lstat)

其中有一条就很有趣：

```text
The lstat() function may fail if:

ELOOP
    More than {SYMLOOP_MAX} symbolic links were encountered
    during resolution of the path argument.
```

在网上查阅了大半个世纪，所有人都说这是通过sysconf动态赋值的，只要满足不小于POSIX规定的8即可。可是我找到了一件很搞笑的事情：

https://github.com/torvalds/linux/search?q=MAXSYMLINKS&unscoped_q=MAXSYMLINKS

{% asset_img eloop.png %}

无敌的Linux竟然是把这个值写死成40的，nb，属实nb

至此，我们有了一个payload，即`"/proc/self/root"*21+/flag`

payload中：`/proc/self/root`提供了两层symlink（`/proc/self`指向`/proc/[pid]`），也就是说重复21次我们将得到42层symlink，比lstat能够处理的层数多出两层。

## 总结

* 在软件开发的过程中，要有一个统一的异常处理机制，不要一会返回0，一会抛异常的
* 要和一起写代码的沟通好，写好文档（其实`virtual_file_ex`上面注释里写了，返回0是正常，1是有错，我估计调用的人就没好好看（逃））
* 要保证一个操作的一致性，比如这个`require_once`就因为内部前后不一致导致了绕过

## 备注

* 源码分析基于PHP 7.4.5，截止[8.0.0-beta1](https://github.com/php/php-src/blob/44ad2db15fe786b07ce793624885e0c43e0af897/Zend/zend_virtual_cwd.c#L885) php 仍然使用lstat的返回值作为文件是否存在的依据
* 在源码分析的过程中还有一个地方可能导致类似的问题，有兴趣的自己看，此处不点明（
