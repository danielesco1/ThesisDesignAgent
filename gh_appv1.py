# chat_tk_with_last.py (compact, selectable + copy works)
import tkinter as tk; from tkinter import ttk, scrolledtext
import threading, requests, logging
from datetime import datetime
from typing import Optional
from flask import Flask, jsonify
from server.config import api_mode, COMPLETION_MODELS, DEFAULT_COMPLETION
from utils.llm_calls import query
from utils.context_data import get_recent_context, save_conversation

APP_TITLE, WINDOW_SIZE = "Chat Assistant", "820x660"
API_HOST, API_PORT = "127.0.0.1", 5000
DEFAULT_PROJECT_NAME, DEFAULT_RUN_MODE = "default", "local"
DEFAULT_SYSTEM_PROMPT: Optional[str] = None
DEFAULT_GH_URL, DEFAULT_AUTO_PUSH, GH_TIMEOUT_SECONDS = "http://127.0.0.1:8081", True, 1.5

LAST = {"user_input":"", "ai_response":"", "timestamp":""}
LLM_LOCK = threading.Lock()

def llm_infer(text, project, model, mode, system_prompt=None):
    with LLM_LOCK:
        client, completion_model, _ = api_mode(mode, model)
        ctx = get_recent_context(project, limit=2)
        full = ("Previous conversation:\n" + "\n".join([f"User: {u}\nAssistant: {a}" for u,a in ctx]) + f"\n\nUser: {text}") if ctx else text
        out = query(client, completion_model, full, system_prompt=system_prompt)
        save_conversation(project, text, out)
        LAST.update({"user_input":text, "ai_response":out, "timestamp":datetime.utcnow().isoformat()+"Z"})
        return out

logging.getLogger("werkzeug").setLevel(logging.ERROR)
app = Flask(__name__)
@app.get("/health")
def health(): return jsonify({"ok":True,"service":"chat-ui","port":API_PORT})
@app.get("/last")
def last(): return jsonify(LAST)
def run_api(): app.run(host=API_HOST, port=API_PORT, debug=False, use_reloader=False, threaded=True)

class ChatApp:
    def __init__(self, root):
        self.root=root; root.title(APP_TITLE); root.geometry(WINDOW_SIZE)
        self.project=tk.StringVar(value=DEFAULT_PROJECT_NAME)
        self.mode=tk.StringVar(value=DEFAULT_RUN_MODE)
        self.model=tk.StringVar(value=self._default_model_for(DEFAULT_RUN_MODE))
        self.gh=tk.StringVar(value=DEFAULT_GH_URL)
        self.auto_push=tk.BooleanVar(value=DEFAULT_AUTO_PUSH)
        bar=ttk.Frame(root,padding=10); bar.pack(fill=tk.X)
        ttk.Label(bar,text="Project").grid(row=0,column=0,sticky="w"); ttk.Entry(bar,textvariable=self.project,width=18).grid(row=1,column=0,sticky="we",padx=(0,8))
        ttk.Label(bar,text="Mode").grid(row=0,column=1,sticky="w"); self.cmb_mode=ttk.Combobox(bar,textvariable=self.mode,values=self._modes(),state="readonly",width=12); self.cmb_mode.grid(row=1,column=1,sticky="we",padx=(0,8)); self.cmb_mode.bind("<<ComboboxSelected>>",self._on_mode)
        ttk.Label(bar,text="Model").grid(row=0,column=2,sticky="w"); self.cmb_model=ttk.Combobox(bar,textvariable=self.model,values=self._models_for(self.mode.get()),width=28); self.cmb_model.grid(row=1,column=2,sticky="we",padx=(0,8))
        ttk.Label(bar,text="GH URL").grid(row=0,column=3,sticky="w"); ttk.Entry(bar,textvariable=self.gh,width=26).grid(row=1,column=3,sticky="we",padx=(0,8))
        ttk.Checkbutton(bar,text="Auto-send to GH",variable=self.auto_push).grid(row=1,column=4,sticky="w")
        for c in range(5): bar.grid_columnconfigure(c,weight=1)

        self.txt=scrolledtext.ScrolledText(root,wrap="word",font=("Arial",10),height=28)
        self.txt.pack(fill=tk.BOTH,expand=True,padx=10,pady=10)
        # allow selection, block edits; keep copy/select-all working; raise 'sel'
        self.txt.configure(cursor="xterm", takefocus=True, exportselection=True)
        self.txt.bind("<Button-1>", lambda e:(self.txt.focus_set(), None))
        def _keyblock(e):
            nav={"Left","Right","Up","Down","Home","End","Prior","Next"}
            ctrl=e.state & 0x4; meta=e.state & 0x8  # Ctrl / Command
            if e.keysym in nav: return
            if (ctrl or meta) and e.keysym.lower() in ("c","a"): return  # allow Copy / Select All
            return "break"
        self.txt.bind("<Key>", _keyblock)
        for seq in ("<Return>","<BackSpace>","<Delete>","<Control-v>","<Control-V>","<Command-v>","<Command-V>","<<Paste>>","<Control-x>","<Control-X>","<Command-x>","<Command-X>"): self.txt.bind(seq, lambda e:"break")
        self.txt.bind("<Button-2>", lambda e:"break")
        self.txt.tag_config("user",foreground="white",background="#2563eb",lmargin1=6,lmargin2=6,rmargin=6)
        self.txt.tag_config("assistant",foreground="#e5e7eb",background="#1f2937",lmargin1=6,lmargin2=6,rmargin=6)
        self.txt.tag_config("system",foreground="#94a3b8"); self.txt.tag_config("error",foreground="#f87171")
        self.txt.tag_raise("sel")

        inp=ttk.Frame(root,padding=(10,0,10,10)); inp.pack(fill=tk.X)
        self.entry=ttk.Entry(inp,font=("Arial",12)); self.entry.pack(side=tk.LEFT,fill=tk.X,expand=True); self.entry.bind("<Return>",lambda e:self.send()); self.entry.focus()
        self.btn=ttk.Button(inp,text="Send",command=self.send); self.btn.pack(side=tk.RIGHT,padx=(8,0))

        self.status=tk.Label(root,text="Ready",bd=1,relief=tk.SUNKEN,anchor="w"); self.status.pack(fill=tk.X,side=tk.BOTTOM)

        self._menu=tk.Menu(self.txt,tearoff=0); self._menu.add_command(label="Copy",command=lambda:self._copy()); self._menu.add_command(label="Select All",command=lambda:self._sel_all())
        for b in ("<Button-3>","<Control-Button-1>"): self.txt.bind(b,self._menu_popup)
        for k in ("<Control-c>","<Command-c>"): root.bind_all(k,self._copy)
        for k in ("<Control-a>","<Command-a>"): root.bind_all(k,self._sel_all)

        self._apply_dark(); self._write("Welcome! Pick Mode → Model, type a message, and press Enter.","system")

    # UI helpers
    def _modes(self): pref=["local","cloudflare","openai"]; keys=list(COMPLETION_MODELS.keys()); return [m for m in pref if m in keys]+[m for m in keys if m not in pref]
    def _models_for(self,mode): return list(COMPLETION_MODELS.get(mode,{}).keys())
    def _default_model_for(self,mode): return DEFAULT_COMPLETION.get(mode) or (self._models_for(mode)[0] if self._models_for(mode) else "")
    def _on_mode(self,_=None): m=self.mode.get(); self.cmb_model["values"]=self._models_for(m); self.model.set(self._default_model_for(m)); self._status(f"Mode '{m}'")
    def _write(self,txt,tag="system"): self.txt.insert("end",txt+"\n\n",tag); self.txt.see("end")
    def _status(self,msg): self.status.config(text=msg)
    def _menu_popup(self,e): self._menu.tk_popup(e.x_root,e.y_root); self._menu.grab_release()
    def _copy(self,e=None):
        try: s=self.txt.get("sel.first","sel.last")
        except tk.TclError: return "break"
        self.root.clipboard_clear(); self.root.clipboard_append(s); return "break"
    def _sel_all(self,e=None): self.txt.tag_add("sel","1.0","end-1c"); return "break"

    # Dark theme
    def _apply_dark(self):
        BG,CARD,FIELD,FG,MUT,SEL="#0f1115","#111827","#0b1220","#e5e7eb","#94a3b8","#3b82f6"
        st=ttk.Style()
        try: st.theme_use("clam")
        except: pass
        self.root.configure(bg=BG); st.configure("TFrame",background=BG); st.configure("TLabel",background=BG,foreground=FG)
        st.configure("TEntry",fieldbackground=FIELD,foreground=FG,background=CARD); st.configure("TCombobox",fieldbackground=FIELD,foreground=FG,background=CARD); st.configure("TCheckbutton",background=BG,foreground=FG)
        self.status.configure(bg=CARD,fg=MUT); self.txt.configure(bg=FIELD,fg=FG,insertbackground=FG,selectbackground=SEL,selectforeground="#ffffff")

    # Send/worker
    def send(self):
        msg=self.entry.get().strip()
        if not msg: return
        self.entry.delete(0,"end"); self.btn.config(state="disabled"); self._status("Thinking…"); self._write(f"You [{datetime.now().strftime('%H:%M')}]:\n{msg}","user")
        threading.Thread(target=self._work,args=(msg,),daemon=True).start()

    def _work(self,msg):
        try:
            proj=self.project.get().strip() or DEFAULT_PROJECT_NAME
            mode=self.mode.get().strip() or DEFAULT_RUN_MODE
            model=self.model.get().strip() or self._default_model_for(mode)
            try: ans=llm_infer(msg,proj,model,mode,DEFAULT_SYSTEM_PROMPT)
            except Exception as e: self.root.after(0,self._write,str(e),"error"); self.root.after(0,self._status,"Invalid mode/model"); return
            self.root.after(0,self._write,f"Assistant [{datetime.now().strftime('%H:%M')}]:\n{ans}","assistant"); self.root.after(0,self._status,"Ready")
            if self.auto_push.get():
                try: requests.post(self.gh.get().strip(),json={"user_input":msg,"ai_response":ans,"timestamp":datetime.utcnow().isoformat()+"Z","project_name":proj,"model":model,"api_mode":mode},timeout=GH_TIMEOUT_SECONDS)
                except: pass
        finally:
            self.root.after(0,self.btn.config,{"state":"normal"}); self.root.after(0,self.entry.focus)

def main():
    threading.Thread(target=run_api,daemon=True).start()
    r=tk.Tk(); ChatApp(r); r.mainloop()

if __name__=="__main__": main()
