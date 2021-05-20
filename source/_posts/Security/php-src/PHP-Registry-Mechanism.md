---
title: PHP函数、Opcode与注册表
date: 2020-08-14
tags:
    - CTF
    - php-src
---

[上一篇](https://blog.frankli.site/2020/08/05/WMCTF2020-PHP-source-analysis/)需要一些基础知识。本篇blog除介绍这些基础知识外还会进行一些扩展，说一说PHP的其它内部原理。

## 哈希表

PHP在编写过程中大量使用了哈希表数据结构进行内部的处理。
DJBX33A
