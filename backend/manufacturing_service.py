"""Bounded process-local reuse of validated STL geometry; never persists projects."""
from collections import OrderedDict
from copy import deepcopy
from hashlib import sha256
import json
from threading import RLock
from time import monotonic
from backend.manufacturing import generate, printable_parts, preview, package

class ManufacturingService:
    def __init__(self, limit=2, ttl=1200):
        self.limit=limit;self.ttl=ttl;self.entries=OrderedDict();self.lock=RLock()

    def result(self, data, mode='preview', filter='all'):
        key=sha256(json.dumps(data,sort_keys=True,separators=(',',':')).encode()).digest()
        # Single-flight also prevents simultaneous preview/ZIP requests from
        # duplicating the native Boolean and segmentation work.
        with self.lock:
            now=monotonic()
            for old in list(self.entries):
                if now-self.entries[old]['time']>self.ttl:del self.entries[old]
            entry=self.entries.get(key)
            if entry is None:
                parts,manifest,rings=generate(deepcopy(data))
                printed=printable_parts(parts,manifest,rings)
                entry=dict(parts=parts,manifest=manifest,rings=rings,printed=printed,time=now,outputs={})
                self.entries[key]=entry
                while len(self.entries)>self.limit:self.entries.popitem(last=False)
            self.entries.move_to_end(key);entry['time']=monotonic()
            output_key=('zip',filter) if mode=='zip' else ('preview','all')
            if output_key not in entry['outputs']:
                manifest=deepcopy(entry['manifest'])
                if mode=='zip':
                    result=package(entry['parts'],manifest,entry['rings'],filter,
                                   printed=entry['printed'])
                else:
                    result=preview(entry['parts'],manifest,entry['rings'],printed=entry['printed'])
                # Cache only the common complete ZIP and preview; arbitrary
                # filter strings must not grow memory without a bound.
                if output_key[1]=='all':entry['outputs'][output_key]=result
                return result
            return entry['outputs'][output_key]

manufacturing_service=ManufacturingService()
