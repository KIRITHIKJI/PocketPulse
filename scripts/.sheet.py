import sys,glob,os
from PIL import Image
d,prefix,out=sys.argv[1:4]; width=int(sys.argv[4]); h=int(sys.argv[5]); n=int(sys.argv[6])
files=sorted(glob.glob(os.path.join(d,prefix+'*.png')))
for i in range(0,len(files),n):
    group=files[i:i+n]
    sheet=Image.new('RGB',(width*len(group),h),(60,60,60))
    for j,f in enumerate(group):
        im=Image.open(f).convert('RGB'); r=width/im.width
        im=im.resize((width-6,int(im.height*r)))
        sheet.paste(im.crop((0,0,width-6,h)),(j*width,0))
    sheet.save(f"{out}{i//n}.jpg",quality=78)
    print(out,i//n,[os.path.basename(f)[len(prefix)+1:-4] for f in group])
