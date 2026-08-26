from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.ticker import MaxNLocator


ROUNDS = list(range(1, 18))
PLAYS = [55, 146, 204, 169, 139, 147, 119, 130, 113, 117, 113, 118, 107, 111, 108, 54, 12]
DOWNSTREAM = [
    2.763636, 2.678082, 2.132353, 2.402367, 2.064748, 1.904762,
    1.865546, 1.723077, 1.619469, 1.341880, 1.203540, 1.152542,
    0.813084, 0.594595, 0.398148, 0.277778, 0.083333,
]
TOTAL = [value + 1 for value in DOWNSTREAM]


def choose_font() -> str:
    installed = {font.name for font in font_manager.fontManager.ttflist}
    for candidate in ("Microsoft YaHei", "Microsoft YaHei UI", "SimHei", "Noto Sans CJK SC"):
        if candidate in installed:
            return candidate
    return "DejaVu Sans"


plt.rcParams.update({
    "font.family": choose_font(),
    "axes.unicode_minus": False,
    "figure.facecolor": "#fbf8f4",
    "axes.facecolor": "#fffdfb",
    "text.color": "#242839",
    "axes.labelcolor": "#50566e",
    "xtick.color": "#6b7084",
    "ytick.color": "#6b7084",
})

fig = plt.figure(figsize=(12, 7.2), dpi=180)
grid = fig.add_gridspec(2, 1, height_ratios=[3.1, 1.2], hspace=0.12)
ax = fig.add_subplot(grid[0])
bars = fig.add_subplot(grid[1], sharex=ax)

pink = "#e95b9d"
blue = "#597bd8"
purple = "#8d73bd"
grid_color = "#ded9e5"

ax.plot(ROUNDS, TOTAL, color=pink, linewidth=2.7, marker="o", markersize=5.2,
        label="总收益（立即 +1 Joy 也计入）")
ax.plot(ROUNDS, DOWNSTREAM, color=blue, linewidth=2.5, marker="o", markersize=4.8,
        label="后续心动标记收益")
ax.axhline(2.641692, color=pink, linewidth=1.2, linestyle=(0, (4, 4)), alpha=0.45)
ax.axhline(1.641692, color=blue, linewidth=1.2, linestyle=(0, (4, 4)), alpha=0.45)

ax.set_title("【心动夸夸】按打出轮次追踪至局末的收益", fontsize=19, fontweight=600, loc="left", pad=18)
ax.text(0, 1.025, "同一张牌从第 N 轮打出后，累计到该局结束的平均 Joy 收益",
        transform=ax.transAxes, fontsize=10.5, color="#70758a")
ax.set_ylabel("平均 Joy / 张", fontsize=11)
ax.set_ylim(0, 4.15)
ax.grid(axis="y", color=grid_color, linewidth=0.8, alpha=0.75)
ax.spines[["top", "right", "left"]].set_visible(False)
ax.spines["bottom"].set_color(grid_color)
ax.tick_params(axis="x", labelbottom=False, length=0)
ax.tick_params(axis="y", length=0)
ax.legend(loc="upper right", frameon=False, fontsize=10)

ax.annotate("越晚打出，留给标记触发的回合越少",
            xy=(14, TOTAL[13]), xytext=(10.1, 3.25),
            arrowprops=dict(arrowstyle="->", color="#8d8395", linewidth=1.1),
            fontsize=10, color="#62596b")
ax.text(0.985, 0.06, "虚线：全体平均 2.64 / 1.64 Joy",
        transform=ax.transAxes, ha="right", va="bottom", fontsize=9.3, color="#8a8393")

bars.bar(ROUNDS, PLAYS, color=purple, alpha=0.74, width=0.72)
bars.set_ylabel("打出张数", fontsize=10.5)
bars.set_xlabel("【心动夸夸】打出的轮次 N", fontsize=11, labelpad=9)
bars.set_xticks(ROUNDS)
bars.yaxis.set_major_locator(MaxNLocator(nbins=4, integer=True))
bars.grid(axis="y", color=grid_color, linewidth=0.8, alpha=0.6)
bars.spines[["top", "right", "left"]].set_visible(False)
bars.spines["bottom"].set_color(grid_color)
bars.tick_params(axis="both", length=0)
bars.text(0.99, 0.89, "样本：1000 局 · 共打出 1962 张",
          transform=bars.transAxes, ha="right", va="top", fontsize=9.5, color="#777287")

fig.subplots_adjust(left=0.075, right=0.975, top=0.91, bottom=0.105)

output = Path(__file__).resolve().parents[1] / "outputs" / "relationship-card-analysis-1000"
output.mkdir(parents=True, exist_ok=True)
path = output / "heart-compliment-cohort-curve.png"
fig.savefig(path, bbox_inches="tight", facecolor=fig.get_facecolor())
print(path)
