"""
scrape_arxiv_taxonomy.py
------------------------
Tự động extract toàn bộ category taxonomy từ arxiv.org/category_taxonomy
Output: taxonomy.json với structure { code, name, group, description }

Chạy: python scrape_arxiv_taxonomy.py
"""

import requests
from bs4 import BeautifulSoup
import json
import re
import sys

# ── Cấu hình ────────────────────────────────────────────────────────────────

URL = "https://arxiv.org/category_taxonomy"

HEADERS = {
    # arXiv yêu cầu User-Agent có contact email khi dùng automated access
    # https://info.arxiv.org/help/robots.html
    "User-Agent": (
        "Mozilla/5.0 (compatible; TaxonomyScraper/1.0; "
        "mailto:1414439@gmail.com)"   # ← đổi thành email của bạn
    ),
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
}

OUTPUT_FILE = "taxonomy.json"


# ── Scraper chính ────────────────────────────────────────────────────────────

def scrape_taxonomy(url: str) -> dict:
    """
    Parse trang arxiv.org/category_taxonomy.

    Cấu trúc HTML thực tế (đã verify bằng debug):

      <div class="columns divided">          ← 155 rows, mỗi row = 1 category
        <div class="column is-one-fifth">
          <h4>cs.AI <span>(Artificial Intelligence)</span></h4>
          ← code là text node trực tiếp, name là trong <span>
        </div>
        <div class="column">
          <p>Covers all areas of AI...</p>   ← description
        </div>
      </div>

    Subgroup: một số category nằm trong wrapper có h3, leo lên DOM để lấy.
    """
    print(f"Fetching {url} ...")
    r = requests.get(url, headers=HEADERS, timeout=20)
    r.raise_for_status()
    print(f"  → {r.status_code}, {len(r.text):,} chars")

    soup = BeautifulSoup(r.text, "html.parser")
    root = soup.find(id="category_taxonomy_list")
    if not root:
        raise ValueError(
            "Không tìm thấy #category_taxonomy_list — "
            "cấu trúc trang có thể đã thay đổi."
        )

    taxonomy = {}

    for row in root.find_all("div", class_="divided"):
        cols = row.find_all("div", class_="column", recursive=False)
        if len(cols) < 2:
            continue

        # Cột 0: h4 chứa "cs.AI <span>(Artificial Intelligence)</span>"
        h4 = cols[0].find("h4")
        if not h4:
            continue

        # Tách code (text node) và name (trong <span>)
        span = h4.find("span")
        name = span.get_text(strip=True).strip("()") if span else ""
        if span:
            span.extract()
        code = re.sub(r"\s+", " ", h4.get_text()).strip()

        if not code:
            continue

        # Cột 1: description
        desc_p = cols[1].find("p")
        description = re.sub(r"\s+", " ",
            desc_p.get_text(separator=" ")).strip() if desc_p else ""

        # Group từ code prefix: "astro-ph.CO" → "astro-ph", "cs.AI" → "cs"
        group = code.rsplit(".", 1)[0] if "." in code else code

        # Subgroup: leo lên DOM — row nằm trong col nằm trong wrapper có h3
        subgroup = ""
        parent = row.parent
        if parent and parent.name == "div":
            grandparent = parent.parent
            if grandparent and grandparent.name == "div":
                h3 = grandparent.find("h3", recursive=False)
                if not h3:
                    # h3 có thể nằm trong cột đầu của grandparent
                    first_col = grandparent.find("div", class_="column")
                    if first_col:
                        h3 = first_col.find("h3")
                if h3:
                    # Bỏ span/strong chứa archive code, chỉ lấy tên
                    for tag in h3.find_all(["span", "strong"]):
                        tag.extract()
                    subgroup = re.sub(r"\s+", " ", h3.get_text()).strip()

        taxonomy[code] = {
            "code":        code,
            "group":       group,
            "subgroup":    subgroup,
            "name":        name,
            "description": description,
        }

    return taxonomy


# ── Fallback: parse từ GitHub gist đã biết cấu trúc ────────────────────────

FALLBACK_CATEGORIES_PARTIAL = {
    # CS
    "cs.AI":  {"group": "cs", "name": "Artificial Intelligence",              "description": "Covers all areas of AI except Vision, Robotics, Machine Learning, Multiagent Systems, and Computation and Language."},
    "cs.CL":  {"group": "cs", "name": "Computation and Language",             "description": "Covers natural language processing, computational linguistics, speech."},
    "cs.CV":  {"group": "cs", "name": "Computer Vision and Pattern Recognition","description": "Covers image processing, computer vision, pattern recognition, and scene understanding."},
    "cs.LG":  {"group": "cs", "name": "Machine Learning",                     "description": "Covers machine learning and computational aspects of learning."},
    "cs.IR":  {"group": "cs", "name": "Information Retrieval",                "description": "Covers indexing, dictionaries, retrieval, content and analysis."},
    "cs.RO":  {"group": "cs", "name": "Robotics",                             "description": "Covers robotics including manipulation, grasping, control, learning."},
    "cs.NE":  {"group": "cs", "name": "Neural and Evolutionary Computing",    "description": "Covers neural networks, connectionism, genetic algorithms, ALife, adaptive behavior."},
    "cs.CR":  {"group": "cs", "name": "Cryptography and Security",            "description": "Covers all areas of cryptography and security including authentication, public key cryptosystems."},
    "cs.DB":  {"group": "cs", "name": "Databases",                            "description": "Covers database management, storage, retrieval, query processing."},
    "cs.DC":  {"group": "cs", "name": "Distributed, Parallel, and Cluster Computing", "description": "Covers fault-tolerance, distributed algorithms, stabilility, parallel computation."},
    "cs.HC":  {"group": "cs", "name": "Human-Computer Interaction",           "description": "Covers human factors, interface design, interactive systems."},
    "cs.SE":  {"group": "cs", "name": "Software Engineering",                 "description": "Covers design tools, software metrics, testing and debugging, programming environments."},
    "cs.PL":  {"group": "cs", "name": "Programming Languages",                "description": "Covers programming language semantics, type theory, program analysis."},
    "cs.GT":  {"group": "cs", "name": "Computer Science and Game Theory",     "description": "Covers algorithmic game theory, mechanism design, equilibrium computation."},
    "cs.MA":  {"group": "cs", "name": "Multiagent Systems",                   "description": "Covers multiagent systems, distributed AI, intelligent agents."},
    "cs.SY":  {"group": "cs", "name": "Systems and Control",                  "description": "Covers control theory, systems design, optimization and control."},
    "cs.CY":  {"group": "cs", "name": "Computers and Society",                "description": "Covers impact of computers on society, legal aspects, electronic commerce."},
    # Statistics
    "stat.ML": {"group": "stat", "name": "Machine Learning",                  "description": "Covers machine learning papers with statistical focus, methodology and theory."},
    "stat.AP": {"group": "stat", "name": "Applications",                      "description": "Statistics applications in biology, education, finance, engineering."},
    "stat.ME": {"group": "stat", "name": "Methodology",                       "description": "Design of experiments, estimation, model selection, multiple testing."},
    "stat.TH": {"group": "stat", "name": "Statistics Theory",                 "description": "Asymptotics, Bayesian inference, decision theory, estimation."},
    "stat.CO": {"group": "stat", "name": "Computation",                       "description": "Algorithms, simulation, visualization, computation in statistics."},
    # Math
    "math.OC": {"group": "math", "name": "Optimization and Control",          "description": "Operations research, linear programming, control theory, systems theory."},
    "math.ST": {"group": "math", "name": "Statistics Theory",                 "description": "Applied, computational and theoretical statistics."},
    "math.PR": {"group": "math", "name": "Probability",                       "description": "Theory and applications of probability and stochastic processes."},
    # Physics / Quant
    "quant-ph": {"group": "quant-ph", "name": "Quantum Physics",              "description": "Covers quantum information, quantum computing, quantum optics."},
    # Bio
    "q-bio.NC": {"group": "q-bio", "name": "Neurons and Cognition",           "description": "Computational, theoretical, experimental neuroscience."},
    "q-bio.QM": {"group": "q-bio", "name": "Quantitative Methods",            "description": "All other topics in quantitative biology."},
    # Econ
    "econ.GN": {"group": "econ", "name": "General Economics",                 "description": "General topics in economics."},
    "econ.EM": {"group": "econ", "name": "Econometrics",                      "description": "Econometric and statistical methods and their applications."},
    # EESS
    "eess.AS": {"group": "eess", "name": "Audio and Speech Processing",       "description": "Speech recognition, speech synthesis, audio processing."},
    "eess.IV": {"group": "eess", "name": "Image and Video Processing",        "description": "Image and video acquisition, restoration, enhancement, segmentation."},
    "eess.SP": {"group": "eess", "name": "Signal Processing",                 "description": "Signal processing including coding, filtering, estimation."},
    "eess.SY": {"group": "eess", "name": "Systems and Control",               "description": "Control theory, optimization, signal processing for systems."},
}

def add_codes_to_fallback(d: dict) -> dict:
    return {k: {"code": k, **v} for k, v in d.items()}


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    taxonomy = {}

    # Thử scrape thật
    try:
        taxonomy = scrape_taxonomy(URL)
        print(f"\n✓ Scraped {len(taxonomy)} categories từ arXiv")
    except Exception as e:
        print(f"\n✗ Scrape thất bại: {e}")
        print("→ Dùng fallback data (partial, ~35 categories phổ biến)")
        taxonomy = add_codes_to_fallback(FALLBACK_CATEGORIES_PARTIAL)

    if not taxonomy:
        print("✗ Không có data nào. Kiểm tra network hoặc cấu trúc HTML.")
        sys.exit(1)

    # Thống kê
    groups = {}
    for v in taxonomy.values():
        g = v.get("group", "unknown")
        groups[g] = groups.get(g, 0) + 1

    print(f"\nPhân bố theo group:")
    for g, count in sorted(groups.items(), key=lambda x: -x[1]):
        print(f"  {g:12s}: {count} categories")

    # Ghi output
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(taxonomy, f, ensure_ascii=False, indent=2)

    print(f"\n✓ Đã ghi {len(taxonomy)} categories → {OUTPUT_FILE}")

    # Preview
    print("\nPreview (5 entries đầu):")
    for code, data in list(taxonomy.items())[:5]:
        sub = f" [{data['subgroup']}]" if data.get('subgroup') else ""
        print(f"  {code}{sub}: {data['name']}")
        if data.get('description'):
            print(f"    → {data['description'][:80]}...")

    # Coverage stats
    with_sub  = sum(1 for v in taxonomy.values() if v.get('subgroup'))
    with_desc = sum(1 for v in taxonomy.values() if v.get('description'))
    print(f"\nSubgroup coverage  : {with_sub}/{len(taxonomy)}")
    print(f"Description coverage: {with_desc}/{len(taxonomy)}")


if __name__ == "__main__":
    main()
