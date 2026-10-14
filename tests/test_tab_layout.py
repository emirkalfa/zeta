"""Result tabs must remain siblings of the input form in the main layout."""
from html.parser import HTMLParser
from pathlib import Path


def test_all_tabs_belong_to_the_main_content_and_only_input_contains_the_form():
    class Parser(HTMLParser):
        def __init__(self):super().__init__();self.stack=[];self.tabs={}
        def handle_starttag(self,tag,attrs):
            attrs=dict(attrs)
            if tag=='section' and 'data-tab' in attrs:
                assert any(t=='main' and a.get('id')=='content' for t,a in self.stack)
                assert not any(t=='section' and 'data-tab' in a for t,a in self.stack)
                assert not any(t=='form' for t,a in self.stack)
                self.tabs[attrs['data-tab']]=True
            if tag=='form' and attrs.get('id')=='paramForm':
                assert any(t=='section' and a.get('data-tab')=='input' for t,a in self.stack)
            if tag not in ['input','meta','link','img','br','hr']:self.stack.append((tag,attrs))
        def handle_endtag(self,tag):
            for i in range(len(self.stack)-1,-1,-1):
                if self.stack[i][0]==tag:self.stack=self.stack[:i];break
    p=Parser();p.feed((Path(__file__).resolve().parents[1]/'templates/index.html').read_text(encoding='utf-8'))
    assert set(p.tabs)=={'input','results','viewer','fuse','charts','flight','mission','stl'}
