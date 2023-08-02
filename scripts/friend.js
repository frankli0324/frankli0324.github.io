const REG_NAMED_ARG = new RegExp(/\[([^=]+)=(.+)\]/)

hexo.extend.tag.register(`friendlinks`, async function (args, content) {
    cards = ''
    for (var i = 0; i < args.length / 3; i++) {
        const data = {}
        for (var j = 0; j < 3; j++) {
            const matched = args[i * 3 + j].match(REG_NAMED_ARG)
            data[matched[1]] = matched[2]
        }
        cards += `
<div class="card">
    <a href="${data.url}" class="avatar"><img src="${data.avatar}"></a>
    <a href="${data.url}" class="title">${data.title}</a>
</div>
`;
        if ((i + 1) % 5 == 0) cards += ''
    }
    return '<div class="card-container">' + cards + '</div>'
}, { async: true })
const css = `
<style>
    .card {
        border-radius: 5px;
        border: 1px solid;
        border-color: #eee #ddd #bbb;
        box-shadow: rgba(0,0,0,.14) 0 1px 3px;
        text-align: center;  
        float: left;
        padding: 10px;
        margin: 10px;
    }
    .card .avatar {
        display: block;
        width: calc(100% - 20px);
        height: calc(100% - 20px);
        align-content: center;
        margin: auto
    }
    .card .title { white-space: nowrap; }
    @media screen and (max-width: 480px) {
        .card { width: calc(33% - 20px); }
    }
    @media screen and (max-width: 600px) and (min-width: 481px) {
        .card { width: calc(25% - 20px); }
    }
    @media screen and (min-width: 601px) {
        .card { width: calc(20% - 20px); }
    }
    .card-container { width: 90%; }
</style>`;
hexo.extend.injector.register('head_end', css);
