import json,re,sys,collections
d=json.load(open(sys.argv[1],encoding='utf8'))
print(d['stats'])
agg=collections.Counter(); ex={}
def walk(s):
    for sp in s.get('specs',[]):
        for t in sp['tests']:
            for r in t['results']:
                for e in r.get('errors',[]):
                    m=re.sub(r'\x1b\[[0-9;]*m','',e.get('message',''))
                    ids=re.findall(r'"id": "([a-z-]+)"',m)
                    for i in ids or ['OTHER:'+m[:120]]:
                        agg[i]+=1; ex.setdefault(i,(sp['title'],m[:1100]))
    for c in s.get('suites',[]): walk(c)
for s in d['suites']: walk(s)
print(agg)
for k,(t,m) in list(ex.items())[:8]: print('---',k,t); print(m)
