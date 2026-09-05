/* Football CEO persistent career storage — v0.24.35
   IndexedDB replaces localStorage for full career saves. localStorage is used
   only as a migration source / tiny fallback metadata store when IndexedDB is
   genuinely unavailable. */
(function(){
  const DB_NAME='football-ceo-careers';
  const DB_VERSION=1;
  const CAREER_STORE='careers';
  const META_STORE='metadata';
  let dbPromise=null;
  let mode='initialising';
  let lastError=null;

  function indexedDBSupported(){
    return typeof indexedDB!=='undefined' && indexedDB && typeof indexedDB.open==='function';
  }

  function openDatabase(){
    if(dbPromise) return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      if(!indexedDBSupported()){
        const err=new Error('IndexedDB is not available in this browser');
        lastError=err; mode='unavailable'; reject(err); return;
      }
      const request=indexedDB.open(DB_NAME,DB_VERSION);
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains(CAREER_STORE)) db.createObjectStore(CAREER_STORE,{keyPath:'id'});
        if(!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE,{keyPath:'id'});
      };
      request.onsuccess=()=>{
        const db=request.result;
        db.onversionchange=()=>{ try{db.close();}catch(e){} dbPromise=null; };
        mode='indexeddb';
        resolve(db);
      };
      request.onerror=()=>{
        lastError=request.error||new Error('Could not open IndexedDB');
        mode='unavailable';
        reject(lastError);
      };
      request.onblocked=()=>{
        lastError=new Error('Career database upgrade is blocked by another open Football CEO tab');
      };
    });
    return dbPromise;
  }

  function transactionPromise(tx){
    return new Promise((resolve,reject)=>{
      tx.oncomplete=()=>resolve(true);
      tx.onabort=()=>reject(tx.error||new Error('Career database transaction aborted'));
      tx.onerror=()=>reject(tx.error||new Error('Career database transaction failed'));
    });
  }

  function requestPromise(request){
    return new Promise((resolve,reject)=>{
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error('Career database request failed'));
    });
  }

  async function init(){
    const db=await openDatabase();
    // Installed PWAs are often granted persistent storage automatically. Asking
    // is harmless where supported and materially reduces eviction risk on some browsers.
    try{
      if(navigator?.storage?.persist) await navigator.storage.persist();
    }catch(e){}
    return {mode,dbName:DB_NAME};
  }

  async function putCareer(id,state,metadata){
    if(!id||!state) throw new Error('Cannot save an empty career');
    const db=await openDatabase();
    const tx=db.transaction([CAREER_STORE,META_STORE],'readwrite');
    tx.objectStore(CAREER_STORE).put({id,state});
    tx.objectStore(META_STORE).put({...metadata,id});
    await transactionPromise(tx);
    return true;
  }

  async function getCareer(id){
    if(!id) return null;
    const db=await openDatabase();
    const tx=db.transaction(CAREER_STORE,'readonly');
    const record=await requestPromise(tx.objectStore(CAREER_STORE).get(id));
    return record?.state||null;
  }

  async function getMetadata(id){
    if(!id) return null;
    const db=await openDatabase();
    const tx=db.transaction(META_STORE,'readonly');
    return (await requestPromise(tx.objectStore(META_STORE).get(id)))||null;
  }

  async function listMetadata(){
    const db=await openDatabase();
    const tx=db.transaction(META_STORE,'readonly');
    const rows=(await requestPromise(tx.objectStore(META_STORE).getAll()))||[];
    return rows.sort((a,b)=>String(b.savedAt||'').localeCompare(String(a.savedAt||'')));
  }

  async function hasCareer(id){
    if(!id) return false;
    const db=await openDatabase();
    const tx=db.transaction(CAREER_STORE,'readonly');
    const key=await requestPromise(tx.objectStore(CAREER_STORE).getKey(id));
    return key!=null;
  }

  async function deleteCareer(id){
    if(!id) return false;
    const db=await openDatabase();
    const tx=db.transaction([CAREER_STORE,META_STORE],'readwrite');
    tx.objectStore(CAREER_STORE).delete(id);
    tx.objectStore(META_STORE).delete(id);
    await transactionPromise(tx);
    return true;
  }

  async function storageEstimate(){
    try{
      if(navigator?.storage?.estimate){
        const e=await navigator.storage.estimate();
        return {usage:Number(e?.usage||0),quota:Number(e?.quota||0)};
      }
    }catch(e){}
    return {usage:0,quota:0};
  }

  function status(){ return {mode,lastError:lastError?String(lastError.message||lastError):null}; }

  globalThis.FootballCEOSaveStore={
    init,putCareer,getCareer,getMetadata,listMetadata,hasCareer,deleteCareer,storageEstimate,status,
    DB_NAME,DB_VERSION
  };
})();
