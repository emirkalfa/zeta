"""Position attachments relative to the actual loft rather than nominal height."""
import numpy as np

def place_wing_assembly(data):
    g=data['geometry'];position=g.get('wing_position','mid')
    rings=np.asarray(data['fuselage'],dtype=float)
    if rings.ndim!=3 or rings.shape[-1]!=3 or rings.shape[0]<3:return data
    x=(float(g['wing_x_pos'])+float(g['root_chord'])*.4)*1000
    xs=rings[:,0,0];lo=np.interp(x,xs,rings[:,:,1].min(axis=1));hi=np.interp(x,xs,rings[:,:,1].max(axis=1))
    offset=(hi+lo)/2+{'low':-.65,'mid':0,'high':.65}.get(position,0)*(hi-lo)/2
    delta=offset-float(g.get('wing_position_offset',0))*1000
    panels=[]
    for spec in data['panels']:
        p={**spec,'root':list(spec['root']),'tip':list(spec['tip'])}
        if p['kind']=='wing' or g.get('tail_booms'):
            p['root'][1]+=delta/1000;p['tip'][1]+=delta/1000
        panels.append(p)
    return {**data,'geometry':{**g,'wing_position_offset':offset/1000},'panels':panels}
