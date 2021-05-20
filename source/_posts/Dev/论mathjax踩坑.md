---
title: 论mathjax踩坑
date: 2019-08-07
tags:
 - 杂项
math: false
---

> 我就不应该想起来要折腾博客的

## 结论

结论放前面吧  
hexo自带的renderer对mathjax较不友好，于是换成了`hexo-renderer-markdown-it`  
[renderer-marked](https://github.com/hexojs/hexo-renderer-marked)  
[renderer-markdown-it](https://github.com/hexojs/hexo-renderer-markdown-it)  
其实这并没有解决我的问题，只是看着有commonmark..真正解决我问题的是[这个issue](https://github.com/hexojs/hexo-renderer-markdown-it/issues/36)

现在的配置基本上是这样:
npm install --save hexo-renderer-markdown-it markdown-it-mathjax
使用了cactus主题，具体配置不说，主要是在cactus/layout/poast.ejs中要手动对文章内的公式渲染一下

```js
<% if(page.math) { %>
<script type="text/x-mathjax-config">
  MathJax.Hub.Config({
    "HTML-CSS": { 
      scale: 100,
      preferredFont: "TeX",
      availableFonts: ["STIX","TeX"],
      linebreaks: { automatic:true },
      EqnChunk: (MathJax.Hub.Browser.isMobile ? 10 : 50)
    },
    tex2jax: { 
      inlineMath: [ ["$", "$"] ],
      displayMath: [ ["$$", "$$"] ],
      processEscapes: true,
      ignoreClass: "tex2jax_ignore|dno",
      skipTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']
    },
    TeX: {
      noUndefined: {
        attributes: {
          mathcolor: "red", mathbackground: "#FFEEEE", mathsize: "90%"
        }
      }, Macros: { href: "{}" } 
    },
    messageStyle: "none"
  }); 
</script>
<script type="text/x-mathjax-config">
    MathJax.Hub.Queue(function() {
        var all = MathJax.Hub.getAllJax(), i;
        for(i=0; i < all.length; i += 1) {
            all[i].SourceElement().parentNode.className += ' has-jax';
        }
    });
</script>
<script type="text/javascript" src="https://cdn.mathjax.org/mathjax/latest/MathJax.js?config=TeX-AMS-MML_HTMLorMML"></script>
<% } %>
```

然后在需要用mathjax的文章的header里头填个
```yml
math: true
```
就好啦

## 使用Mathjax备忘

  除了mathjax的基本语法，有些会用到但不太常用到的东西在这稍稍记一下，长期更新

  本篇文章设置了`math: false`

### 功能

写法

### 多行公式+对齐

\begin{align}  
& 1+1 \\\\  
= & 2 \\\\  
= & 5-4  
\end{align}