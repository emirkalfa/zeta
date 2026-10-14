"""Static vertical thrust shares; geometry only, using an assumed symmetric CG."""
import numpy as np


def hover_balance(g,motors):
    points=np.array([[m['face_mm'][0],m['face_mm'][2]] for m in motors],dtype=float)
    cg_x=(float(g.get('wing_ac_x',g['wing_x_pos']+.25*g['mac']))-.25*g['mac']+g['cg_position'])*1000
    cg=np.array([cg_x,0.])
    weights=np.linalg.solve(np.vstack([np.ones(3),points.T]),np.r_[1,cg])
    centroid=points.mean(axis=0)
    return {'assumed_cg_mm':cg.tolist(),'triangle_centroid_mm':centroid.tolist(),
            'centroid_distance_mm':float(np.linalg.norm(centroid-cg)),
            'inside_triangle':bool(np.all(weights>0)),
            'vertical_thrust_fraction':{m['name']:float(w) for m,w in zip(motors,weights)},
            'assumption':'Sabit kanat CG ayarı ve yanal merkez varsayılır. Motorlar dikey, toplam itki ağırlığa eşit ve hareket ivmesi sıfır kabul edilir. Gerçek ağırlık merkezi, itki kapasitesi ve uçuş kontrolü ölçülmemiştir.'}
