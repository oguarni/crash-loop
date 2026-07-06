#!/usr/bin/env python3
"""Build the crash-loop Status Point PDF from its Markdown source.

Usage:
    python3 scripts/build-status.py [path/to/Status-Point.md]

Defaults to Status-Point_crash-loop_Three-Way-Merge.md in the repo root and
writes a PDF with the same basename next to it. Requires xelatex and the Inter +
Fira Code fonts. The Markdown is the single source of truth; rerun after editing.

Renderer mirrors scripts/build-gdd.py; only the title page, the running header,
and the PDF metadata differ, so the GDD build is left untouched.
"""
import re, sys, pathlib, tempfile, subprocess, shutil

ROOT = pathlib.Path(__file__).resolve().parent.parent
MD = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "Status-Point_crash-loop_Three-Way-Merge.md"
src = MD.read_text(encoding="utf-8")

# ---------- inline formatting ----------
def esc(s: str) -> str:
    s = s.replace("\\", r"\textbackslash{}")
    s = s.replace("{", r"\{").replace("}", r"\}")
    s = s.replace("&", r"\&").replace("%", r"\%").replace("#", r"\#")
    s = s.replace("$", r"\$").replace("_", r"\_")
    s = s.replace("~", r"\textasciitilde{}").replace("^", r"\textasciicircum{}")
    return s

def inline(text: str) -> str:
    codes = []
    def stash(m):
        codes.append(m.group(1))
        return f"\x00{len(codes)-1}\x00"
    text = re.sub(r"`([^`]+)`", stash, text)
    text = esc(text)
    text = re.sub(r"\*\*(.+?)\*\*", r"\\textbf{\1}", text)
    text = re.sub(r"\*(.+?)\*", r"\\textit{\1}", text)
    def restore(m):
        return r"\texttt{" + esc(codes[int(m.group(1))]) + "}"
    return re.sub(r"\x00(\d+)\x00", restore, text)

def strip_num(title: str) -> str:
    return re.sub(r"^\d+(\.\d+)?\.?\s*", "", title).strip()

# ---------- block renderers ----------
def render_table(lines):
    rows = []
    for ln in lines:
        if re.match(r"^\|\s*[-:]+\s*(\|\s*[-:]+\s*)*\|?\s*$", ln):
            continue
        cells = [c.strip() for c in ln.strip().strip("|").split("|")]
        rows.append(cells)
    if not rows:
        return ""
    ncols = len(rows[0])
    colspec = "*{%d}{>{\\RaggedRight\\arraybackslash}X}" % ncols
    out = ["\\begin{center}", "\\renewcommand{\\arraystretch}{1.25}",
           "\\begin{tabularx}{\\linewidth}{%s}" % colspec, "\\toprule",
           " & ".join(r"\textbf{%s}" % inline(c) for c in rows[0]) + r" \\", "\\midrule"]
    for r in rows[1:]:
        r = (r + [""] * ncols)[:ncols]
        out.append(" & ".join(inline(c) for c in r) + r" \\")
    out += ["\\bottomrule", "\\end{tabularx}", "\\end{center}"]
    return "\n".join(out)

def render_list(items, ordered=False):
    env = "enumerate" if ordered else "itemize"
    return "\n".join(["\\begin{%s}" % env] + ["  \\item " + inline(it) for it in items] + ["\\end{%s}" % env])

def classify(block):
    if all(ln.lstrip().startswith("|") for ln in block):
        return "table"
    if all(re.match(r"^- ", ln) for ln in block):
        return "ul"
    if all(re.match(r"^\d+\.\s", ln) for ln in block):
        return "ol"
    return "p"

def render_blocks(text):
    blocks = []
    for b in re.split(r"\n\s*\n", text.strip()):
        ls = [l for l in b.split("\n") if l.strip() != ""]
        if ls:
            blocks.append(ls)
    out, i = [], 0
    while i < len(blocks):
        kind = classify(blocks[i])
        if kind in ("ul", "ol"):
            items, j = [], i
            while j < len(blocks) and classify(blocks[j]) == kind:
                items += [re.sub(r"^(- |\d+\.\s)", "", ln) for ln in blocks[j]]
                j += 1
            out.append(render_list(items, ordered=(kind == "ol")))
            i = j
        elif kind == "table":
            out.append(render_table(blocks[i])); i += 1
        else:
            out.append(inline(" ".join(blocks[i]))); i += 1
    return "\n\n".join(out)

# ---------- code fences (reproduce-this command blocks) ----------
def render_fence(lines):
    body = "\n".join(esc(l) for l in lines)
    return ("\\begin{tcolorbox}[enhanced,boxrule=0.6pt,colback=panel!6!white,"
            "colframe=charcoal!55!white,arc=2pt,left=8pt,right=8pt,top=6pt,bottom=6pt]\n"
            "{\\monofont\\small\\color{charcoal!20!black}\\setlength{\\parindent}{0pt}%\n"
            + body.replace("\n", "\\\\\n") + "}\n\\end{tcolorbox}")

# ---------- walk the document ----------
body, buf, started, skip = [], [], False, False
fence, fbuf = False, []

def flush():
    global buf
    if buf and started and not skip:
        body.append(render_blocks("\n".join(buf)))
    buf = []

for line in src.split("\n"):
    if line.strip().startswith("```"):
        if fence:
            if started and not skip:
                body.append(render_fence(fbuf))
            fence, fbuf = False, []
        else:
            flush(); fence, fbuf = True, []
        continue
    if fence:
        fbuf.append(line); continue
    if re.match(r"^# ", line):
        continue
    m2, m3 = re.match(r"^## (.+)", line), re.match(r"^### (.+)", line)
    if m2:
        title = m2.group(1).strip()
        if title.lower().startswith("sumário"):
            flush(); skip = True; continue
        flush(); skip = False; started = True
        body.append(r"\section{%s}" % inline(strip_num(title)))
    elif m3:
        if not skip:
            flush(); body.append(r"\subsection{%s}" % inline(strip_num(m3.group(1).strip())))
    elif started and not skip:
        buf.append(line)
flush()
BODY = "\n\n".join(body)

PREAMBLE = r"""\documentclass[11pt]{article}
\usepackage{fontspec}
\usepackage[a4paper,top=2.3cm,bottom=2.4cm,left=2.4cm,right=2.4cm]{geometry}
\usepackage{xcolor}
\usepackage{array}
\usepackage{tabularx}
\usepackage{booktabs}
\usepackage{ragged2e}
\usepackage{enumitem}
\usepackage{titlesec}
\usepackage{parskip}
\usepackage{fancyhdr}
\usepackage{microtype}
\usepackage[skins]{tcolorbox}
\usepackage[hidelinks]{hyperref}

\definecolor{navy}{HTML}{0B1020}
\definecolor{phosphor}{HTML}{7CFFB2}
\definecolor{amber}{HTML}{E0B265}
\definecolor{bone}{HTML}{F1EEE6}
\definecolor{charcoal}{HTML}{3A3D45}
\definecolor{panel}{HTML}{10162B}
\definecolor{greenink}{HTML}{1C7A4E}
\definecolor{rulec}{HTML}{C9C4B6}
\definecolor{alert}{HTML}{C0392B}

\setmainfont{Inter}[Numbers=Lining]
\newfontfamily\monofont{Fira Code}[Scale=0.92]
\newfontfamily\headfont{Fira Code}[Scale=1.0]
\setmonofont{Fira Code}[Scale=0.92]

\hypersetup{unicode=true,
  pdftitle={crash-loop --- Status Point},
  pdfauthor={Three-Way Merge}}

% No Portuguese hyphenation patterns are installed; disable hyphenation so no
% word is broken with English rules. emergencystretch keeps lines from overflowing.
\hyphenpenalty=10000
\exhyphenpenalty=10000
\tolerance=3000
\emergencystretch=3.2em
\setlist{leftmargin=1.4em,itemsep=2pt,topsep=3pt,parsep=0pt}

\titleformat{\section}[block]
  {\headfont\bfseries\large\color{navy}}
  {\textcolor{greenink}{\bfseries>}\,\thesection}{0.6em}{}
  [{\vspace{2pt}\textcolor{greenink}{\titlerule[0.8pt]}}]
\titlespacing*{\section}{0pt}{1.7em}{0.7em}
\titleformat{\subsection}[block]
  {\headfont\bfseries\normalsize\color{greenink!85!navy}}
  {\thesubsection}{0.5em}{}
\titlespacing*{\subsection}{0pt}{0.9em}{0.35em}

\fancypagestyle{main}{%
  \fancyhf{}
  \renewcommand{\headrulewidth}{0.3pt}
  \renewcommand{\footrulewidth}{0pt}
  \fancyhead[L]{\footnotesize\headfont\color{charcoal} crash-loop}
  \fancyhead[R]{\footnotesize\color{charcoal} Status Point}
  \fancyfoot[C]{\footnotesize\color{charcoal}\thepage}
}

\begin{document}

\begin{titlepage}
\pagecolor{navy}\color{bone}\thispagestyle{empty}
\centering
\vspace*{1.6cm}
{\headfont\small\color{phosphor} helix-cloud // operator terminal\par}
\vspace{0.9cm}
\begin{tcolorbox}[enhanced,width=0.9\textwidth,colback=panel,colframe=charcoal,
  boxrule=1pt,arc=4pt,left=14pt,right=14pt,top=12pt,bottom=14pt,
  coltitle=bone,colbacktitle=navy,fonttitle=\headfont\bfseries\small,
  title={\textcolor{alert}{\textbullet}\,\textcolor{amber}{\textbullet}\,\textcolor{phosphor}{\textbullet}\hfill crash-loop \hfill\mbox{}}]
\monofont\small\color{bone}\raggedright
\textcolor{phosphor}{operator@helix}:\textcolor{amber}{\char`~}\$ ./status --incident\\[4pt]
\textcolor{greenink!60!bone}{[ok]}~ sim engine: 23/23 checks\\
\textcolor{greenink!60!bone}{[ok]}~ build: tsc clean + vite ok\\
\textcolor{amber}{[..]}~ etapa 3: in progress\\[12pt]
{\headfont\bfseries\Huge\color{phosphor} crash-loop}\\[6pt]
{\color{bone} Status Point --- Ponto de Situa\c{c}\~ao}
\end{tcolorbox}
\vspace{1.3cm}

{\large\color{bone}\textbf{Ponto de Situa\c{c}\~ao do Desenvolvimento}}\\[7pt]
{\headfont\color{amber} Equipe Three-Way Merge}\\[7pt]
{\color{bone} Gabriel Felipe Guarnieri\\[2pt] Hector Guar\c{c}oni Machado\\[2pt] Marcos Win\'icios Silva Martins}

\vfill
{\footnotesize\color{bone}
Engenharia de Software para Jogos --- 2026/1 \\[3pt]
2026-06-27 \quad\textbullet\quad Prot\'otipo jog\'avel: L01--L02 (TypeScript + HTML5 Canvas)}
\vspace{0.6cm}
\end{titlepage}
\pagecolor{white}\color{black}

\pagestyle{main}
\setcounter{page}{1}
\color{charcoal!30!black}
"""

FOOTER = "\n\\end{document}\n"

# ---------- compile ----------
xelatex = shutil.which("xelatex")
if not xelatex:
    sys.exit("error: xelatex not found (install TeX Live with xetex).")
build = pathlib.Path(tempfile.mkdtemp(prefix="status-build-"))
(build / "status.tex").write_text(PREAMBLE + "\n" + BODY + FOOTER, encoding="utf-8")
for _ in range(2):  # twice for stable page references
    proc = subprocess.run([xelatex, "-interaction=nonstopmode", "-halt-on-error", "status.tex"],
                          cwd=build, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
pdf = build / "status.pdf"
if proc.returncode != 0 or not pdf.exists():
    sys.exit(f"error: xelatex failed; inspect {build/'status.log'}")
out_pdf = MD.with_suffix(".pdf")
shutil.copy(pdf, out_pdf)
shutil.rmtree(build, ignore_errors=True)
print(f"built {out_pdf}  ({BODY.count(chr(92)+'section{')} sections)")
