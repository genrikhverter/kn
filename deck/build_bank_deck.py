# -*- coding: utf-8 -*-
"""Дека «Код Урожая» для финансиста и банкира. v3: платформенная экономика
(Uber, Ozon/WB, Яндекс Такси), лот и лотная экономика, кредитный цикл и
финансовые инструменты. Без повторения агрономической деки.
Дизайн — дизайн-система грантовой презентации (см. КОНТЕКСТ_деки.md)."""
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import (XL_CHART_TYPE, XL_LEGEND_POSITION,
                             XL_LABEL_POSITION, XL_TICK_MARK)

W, H = 13.333, 7.5
TF, BF = "Verdana", "Calibri"

NAVY   = RGBColor.from_string("002060")
BLUE   = RGBColor.from_string("0070C0")
ORANGE = RGBColor.from_string("ED7D31")
GREEN  = RGBColor.from_string("70AD47")
TEXT   = RGBColor.from_string("262626")
MUTED  = RGBColor.from_string("595959")
TINT   = RGBColor.from_string("DEEBF7")
TINT_G = RGBColor.from_string("E2EFDA")
TINT_O = RGBColor.from_string("FBE5D6")
HAIR   = RGBColor.from_string("D9D9D9")

A = "/home/vmalt/knp-dev/mite_dev/deck/assets"
SCR = "/home/vmalt/knp-dev/mite_dev/docs-screenshots"
OUT = "/home/vmalt/knp-dev/mite_dev/Код_Урожая_для_финансиста.pptx"
IMG_AR = 811.0 / 1680.0
BANK_AR = 811.0 / 2240.0
CW = 10.51

prs = Presentation()
prs.slide_width, prs.slide_height = Inches(W), Inches(H)
prs.core_properties.title = "«Код Урожая» — платформенная экономика для АПК"
prs.core_properties.author = "ГУУ · проект продовольственной безопасности"


def new_slide():
    return prs.slides.add_slide(prs.slide_layouts[6])


def text(s, x, y, w, h, paras, anchor=MSO_ANCHOR.TOP, wrap=True):
    tb = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = wrap
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    for i, d in enumerate(paras):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = d.get("align", PP_ALIGN.LEFT)
        if d.get("space_after") is not None:
            p.space_after = Pt(d["space_after"])
        if d.get("line"):
            p.line_spacing = d["line"]
        r = p.add_run()
        r.text = d["t"]
        f = r.font
        f.name = d.get("font", BF)
        f.size = Pt(d.get("size", 13))
        f.bold = d.get("bold", False)
        f.italic = d.get("italic", False)
        f.color.rgb = d.get("color", TEXT)
    return tb


def rect(s, x, y, w, h, fill=None, line=None, lw=1.0, round_=False, radius=0.1):
    shp = s.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE if round_ else MSO_SHAPE.RECTANGLE,
        Inches(x), Inches(y), Inches(w), Inches(h))
    if round_:
        try:
            shp.adjustments[0] = radius
        except Exception:
            pass
    if fill is None:
        shp.fill.background()
    else:
        shp.fill.solid()
        shp.fill.fore_color.rgb = fill
    if line is None:
        shp.line.fill.background()
    else:
        shp.line.color.rgb = line
        shp.line.width = Pt(lw)
    shp.shadow.inherit = False
    return shp


def dot(s, x, y, d=0.11, color=BLUE):
    o = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(x), Inches(y), Inches(d), Inches(d))
    o.fill.solid(); o.fill.fore_color.rgb = color
    o.line.fill.background(); o.shadow.inherit = False
    return o


def hair(s, x, y, w):
    return rect(s, x, y, w, Pt(1.1), fill=HAIR)


def arrow(s, x, y, w=0.3, h=0.2, shape=MSO_SHAPE.RIGHT_ARROW):
    a = s.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    a.fill.solid(); a.fill.fore_color.rgb = RGBColor.from_string("8FAADC")
    a.line.fill.background(); a.shadow.inherit = False
    return a


def content_slide(title, page):
    s = new_slide()
    s.shapes.add_picture(f"{A}/image4.png", Inches(0), Inches(0.01),
                         width=Inches(W), height=Inches(1.073))
    rect(s, 0, 0.01, 7.3, 0.168, fill=RGBColor.from_string("A6A6A6"))
    s.shapes.add_picture(f"{A}/image3.png", Inches(11.06), Inches(0.16),
                         width=Inches(2.27), height=Inches(7.35))
    text(s, 0.39, 0.3, 10.5, 0.6,
         [{"t": title, "size": 24, "bold": True, "color": TEXT, "font": TF}])
    text(s, 11.25, 6.98, 0.95, 0.35,
         [{"t": str(page), "size": 12, "color": MUTED, "align": PP_ALIGN.CENTER}])
    return s


def screenshot(s, path, x, y, w, caption=None, ar=None):
    if ar is None:
        ar = IMG_AR
    pic = s.shapes.add_picture(path, Inches(x), Inches(y), width=Inches(w))
    vh = w * ar
    pic.height = Inches(vh)
    f = rect(s, x, y, w, vh, fill=None, line=HAIR, lw=1.0)
    f.shadow.inherit = False
    if caption:
        text(s, x, y + vh + 0.1, w, 0.45,
             [{"t": caption, "size": 10.5, "color": MUTED, "line": 1.1}])
    return pic


def row_list(s, x, y, w, rows, pitch=0.95, dot_c=BLUE, lead_size=15, desc_size=12.5):
    cy = y
    for lead, desc in rows:
        dot(s, x, cy + 0.06, 0.11, dot_c)
        text(s, x + 0.26, cy - 0.02, w - 0.26, 0.8, [
            {"t": lead, "size": lead_size, "bold": True, "color": TEXT, "space_after": 2},
            {"t": desc, "size": desc_size, "color": MUTED, "line": 1.12},
        ])
        cy += pitch
    return cy


def notes(s, txt):
    s.notes_slide.notes_text_frame.text = txt


def style_chart(ch, cat_size=12, val_size=12):
    ch.font.name = BF
    ch.font.size = Pt(cat_size)
    va, ca = ch.value_axis, ch.category_axis
    va.has_major_gridlines = True
    va.major_gridlines.format.line.color.rgb = RGBColor.from_string("E7E6E6")
    va.major_gridlines.format.line.width = Pt(0.75)
    va.tick_labels.font.size = Pt(val_size)
    va.tick_labels.font.name = BF
    va.tick_labels.font.color.rgb = MUTED
    va.format.line.fill.background()
    ca.has_major_gridlines = False
    ca.tick_labels.font.size = Pt(cat_size)
    ca.tick_labels.font.name = BF
    ca.tick_labels.font.color.rgb = TEXT
    ca.format.line.color.rgb = HAIR
    ca.major_tick_mark = XL_TICK_MARK.NONE


# ─────────────────────────────────────────────────────────────────
# 1 · Титул
s = new_slide()
s.shapes.add_picture(f"{A}/image1.png", Inches(0.83), Inches(0),
                     width=Inches(12.01), height=Inches(7.49))
s.shapes.add_picture(f"{A}/image2.png", Inches(0.53), Inches(0.82),
                     width=Inches(2.22), height=Inches(0.67))
text(s, 2.92, 0.72, 5.55, 0.95, [
    {"t": "Федеральное государственное бюджетное образовательное учреждение высшего образования",
     "size": 11, "bold": True, "color": TEXT, "line": 1.1},
    {"t": "«Государственный университет управления»",
     "size": 11, "bold": True, "color": TEXT, "line": 1.1},
])
text(s, 0.53, 2.15, 11.6, 1.9, [
    {"t": "Цифровая платформа", "size": 40, "bold": True, "color": TEXT,
     "font": "Arial", "space_after": 2},
    {"t": "«КОД УРОЖАЯ»", "size": 40, "bold": True, "color": NAVY, "font": "Arial"},
])
text(s, 0.53, 4.1, 11.9, 0.5,
     [{"t": "платформенная экономика для АПК: от лота зерна — к ликвидному активу",
       "size": 18, "bold": True, "color": BLUE}])
text(s, 0.53, 4.85, 11.9, 1.15, [
    {"t": "«Обеспечение продовольственной безопасности страны на основе создания программно-аппаратных комплексов",
     "size": 14, "bold": True, "color": NAVY, "line": 1.15},
    {"t": "и интеллектуальных платформенных цифровых решений в сфере развития агропромышленных технологий",
     "size": 14, "bold": True, "color": NAVY, "line": 1.15},
    {"t": "полного жизненного цикла»", "size": 14, "bold": True, "color": NAVY, "line": 1.15},
])
text(s, 0.53, 6.15, 6.0, 0.4,
     [{"t": "Руководитель проекта — д.т.н., проф. Терентьев А.В.",
       "size": 14, "color": NAVY}])
text(s, 0.66, 6.6, 5.0, 0.37,
     [{"t": "Москва – 2026 г.", "size": 14, "color": NAVY}])
notes(s, "Финансово-банковская оптика v3: платформенная экономика, лот и лотная экономика, кредитный цикл. Числа сверены со стендом; контур лотов (машина состояний, hash-цепочка, паспорт качества) реализован в смежном контуре KNP.")

# ─────────────────────────────────────────────────────────────────
# 2 · Платформенная экономика (общее)
s = content_slide("ПЛАТФОРМЕННАЯ ЭКОНОМИКА", 1)
feats = [
    ("Соединяет независимых участников",
     "спрос и предложение находят друг друга по правилам среды — "
     "в перевозках, жилье, торговле"),
    ("Каждая транзакция — проверяемый след",
     "данные о сделках и есть главный актив платформы: их видно, "
     "их нельзя «пересказать иначе»"),
    ("Доверие вычисляется",
     "рейтинги и истории заменяют обещания: качество участника видно "
     "до сделки, а не после"),
    ("Ценность растёт с числом участников",
     "сетевой эффект: каждый новый участник делает среду полезнее "
     "для всех остальных"),
]
for i, (ttl, d) in enumerate(feats):
    col, row = i % 2, i // 2
    x = 0.39 + col * (5.1 + 0.31)
    y = 1.5 + row * (1.6 + 0.22)
    rect(s, x, y, 5.1, 1.6, fill=TINT if (i % 2 == 0) else TINT_G,
         round_=True, radius=0.06)
    text(s, x + 0.28, y + 0.2, 4.55, 1.25, [
        {"t": ttl, "size": 13.5, "bold": True, "color": NAVY, "space_after": 4},
        {"t": d, "size": 11.5, "color": TEXT, "line": 1.15},
    ])
text(s, 0.39, 5.0, CW, 0.32,
     [{"t": "Uber · Airbnb · Amazon · Ozon · Яндекс — разные отрасли, "
            "одни и те же правила игры.",
       "size": 12.5, "color": MUTED}])
text(s, 0.39, 5.48, CW, 0.3,
     [{"t": "ЧТО ДАЛЬШЕ", "size": 11, "bold": True, "color": NAVY, "font": TF}])
future = [
    "платформенная логика идёт в реальный сектор: вслед за поездками и товарами — "
    "производство и активы",
    "данные о транзакциях становятся опорой финансовых продуктов — как в платёжных сетях",
    "в АПК сделки до сих пор оформляются бумагой — связывающей платформенной среды пока нет",
]
fy = 5.82
for it in future:
    dot(s, 0.39, fy + 0.04, 0.1, BLUE)
    text(s, 0.63, fy - 0.03, 10.27, 0.4,
         [{"t": it, "size": 11.5, "color": TEXT, "line": 1.08}])
    fy += 0.46
notes(s, "Слайд описывает платформу как экономический феномен: четыре свойства + одна строка примеров. Обоснование про АПК — в третьем пункте «что дальше»: сделки оформляются бумагой, связывающей платформенной среды нет. Никаких «последних секторов» и «закрываем разрыв» — только факты.")

# ─────────────────────────────────────────────────────────────────
# 3 · АПК: деньги дальше всего от предмета
s = content_slide("АПК: ДЕНЬГИ ДАЛЬШЕ ВСЕГО ОТ ПРЕДМЕТА КРЕДИТА", 2)
row_list(s, 0.39, 1.65, 3.6, [
    ("Кредит — под заявленные показатели",
     "площади, урожайность и расходы заявляет заёмщик — проверить их кредитору сложно"),
    ("Партия зерна — без прослеживаемости",
     "от поля до переработчика партия не сохраняет единый «паспорт»: "
     "её путь не восстановить"),
    ("Залог и страховка — по бумаге", "товар в обороте и состояние посева не видны кредитору"),
], pitch=1.15, desc_size=11.5)
hair(s, 0.39, 5.0, 3.6)
text(s, 0.39, 5.2, 3.6, 1.4,
     [{"t": "Земля — главный актив заёмщика — уже отображается в прототипе картой и реестром:",
       "size": 12.5, "color": MUTED, "line": 1.2}])
screenshot(s, f"{SCR}/bank-contracts.png", 4.2, 1.65, 6.6,
           caption="Опытный стенд: карта статусов договоров аренды и реестр участков.",
           ar=BANK_AR)
row_list(s, 4.2, 4.75, 6.6, [
    ("Что уже получается", "в прототипе платформы участки, договоры, бюджеты "
     "и факты сезона сходятся в единый контур данных"),
], pitch=0.6, lead_size=14)
text(s, 0.39, 6.85, CW, 0.4,
     [{"t": "Проблема не в дефиците данных, а в отсутствии платформы, "
            "которая наделяет их ценностью.",
       "size": 13.5, "bold": True, "color": TEXT}])
notes(s, "Боли финансов в АПК. Скрин — карта статусов договоров (залоговая база) живого стенда: земля уже оцифрована, дальше — оборот.")

# ─────────────────────────────────────────────────────────────────
# 4 · Код Урожая как платформа (шина данных)
s = content_slide("«КОД УРОЖАЯ» — ПЛАТФОРМА ДЛЯ АПК", 3)
rect(s, 0.39, 1.75, CW, 1.05, fill=NAVY, round_=True, radius=0.07)
text(s, 0.75, 1.95, CW - 0.72, 0.7, [
    {"t": "ЕДИНЫЙ КОНТУР ДАННЫХ", "size": 16, "bold": True, "font": TF,
     "color": RGBColor.from_string("FFFFFF"), "align": PP_ALIGN.CENTER,
     "space_after": 2},
    {"t": "данные хозяйств, техники и партий продукции", "size": 12,
     "color": RGBColor.from_string("DEEBF7"), "align": PP_ALIGN.CENTER},
])
actors = ["Хозяйства", "Техника\nи датчики", "Хранение\nи элеваторы",
          "Переработчики", "Банк\nи страхование", "ФГИС\nи регуляторы"]
cw4, cg4 = 1.62, 0.162
for i, ttl in enumerate(actors):
    x = 0.39 + i * (cw4 + cg4)
    cx_ = x + cw4 / 2
    rect(s, cx_ - 0.018, 2.8, 0.036, 0.65, fill=RGBColor.from_string("8FAADC"))
    rect(s, x, 3.45, cw4, 1.15, fill=TINT, round_=True, radius=0.1)
    text(s, x + 0.05, 3.55, cw4 - 0.1, 0.95,
         [{"t": ln, "size": 11, "bold": True, "color": TEXT,
           "align": PP_ALIGN.CENTER, "line": 1.08} for ln in ttl.split("\n")],
         anchor=MSO_ANCHOR.MIDDLE)
text(s, 0.39, 5.0, CW, 0.35,
     [{"t": "каждый участник подключён к одному контуру — и видит ту часть данных, "
            "на которую у него есть право", "size": 12, "color": MUTED}])
text(s, 0.39, 5.6, CW, 1.3, [
    {"t": "Как маркетплейс ведёт карточку каждой единицы товара, "
          "так платформа ведёт цифровой след каждой партии продукции — ЛОТ.",
     "size": 14.5, "bold": True, "color": NAVY, "space_after": 4},
    {"t": "Единый идентификатор и проверяемая история оборота делают аграрный рынок "
          "прозрачнее — для всех участников, включая финансы.",
     "size": 12.5, "color": MUTED, "line": 1.15},
])
notes(s, "Схема «шина данных»: широкий контур сверху, участники в ряд подключены короткими отводами — единая картинка без разнонаправленных стрелок. Права доступа: каждый видит свою часть данных.")

# ─────────────────────────────────────────────────────────────────
# 5 · Лот: цифровой двойник партии
s = content_slide("ЛОТ: ЦИФРОВОЙ ДВОЙНИК ПАРТИИ ПРОДУКЦИИ", 4)
life = ["Уборка", "Весовая", "Очистка,\nсушка", "Хранение", "Отгрузка", "Прилавок"]
nx, ny, nw, nh, ng = 0.39, 1.6, 1.59, 0.85, 0.19
for i, ttl in enumerate(life):
    x = nx + i * (nw + ng)
    dark = i in (0, len(life) - 1)
    rect(s, x, ny, nw, nh, fill=NAVY if dark else TINT, round_=True, radius=0.1)
    text(s, x + 0.05, ny + 0.15, nw - 0.1, 0.56,
         [{"t": ln, "size": 11.5, "bold": True,
           "color": RGBColor.from_string("FFFFFF") if dark else TEXT,
           "align": PP_ALIGN.CENTER, "line": 1.05} for ln in ttl.split("\n")],
         anchor=MSO_ANCHOR.MIDDLE)
    if i < len(life) - 1:
        arrow(s, x + nw + 0.01, ny + nh / 2 - 0.09, ng - 0.02, 0.18)
text(s, 0.39, 2.62, 6.9, 0.35,
     [{"t": "лот рождается в бункере комбайна и доходит до прилавка, не меняя ID",
       "size": 12, "color": MUTED}])
text(s, 0.39, 3.15, 6.9, 0.3,
     [{"t": "НЕИЗМЕНЯЕМАЯ ИСТОРИЯ СОБЫТИЙ (HASH-ЦЕПОЧКА)", "size": 11, "bold": True,
       "color": NAVY, "font": TF}])
evs = [("событие 1", "уборка"), ("событие 2", "вес"),
       ("событие 3", "очистка"), ("событие 4", "хранение"),
       ("событие 5", "отгрузка"), ("событие 6", "прилавок")]
hashes = ["h: 7f3a…", "+h: a19b…", "+h: 4e02…", "+h: c88d…", "+h: 51f0…", "+h: b7e9…"]
hx, hy, hw, hh, hg = 0.39, 3.55, 1.0, 0.95, 0.18
for i, (ev, d) in enumerate(evs):
    x = hx + i * (hw + hg)
    rect(s, x, hy, hw, hh, fill=TINT, round_=True, radius=0.09)
    text(s, x + 0.05, hy + 0.14, hw - 0.1, 0.7,
         [{"t": ev, "size": 9.5, "bold": True, "color": TEXT,
           "align": PP_ALIGN.CENTER, "space_after": 1, "line": 1.0},
          {"t": d, "size": 8.5, "color": MUTED,
           "align": PP_ALIGN.CENTER, "line": 1.0}])
    text(s, x, hy + hh + 0.04, hw, 0.25,
         [{"t": hashes[i], "size": 8.5, "color": BLUE, "align": PP_ALIGN.CENTER}])
    if i < len(evs) - 1:
        arrow(s, x + hw + 0.01, hy + hh / 2 - 0.08, hg - 0.02, 0.16)
text(s, 0.39, 5.05, 6.9, 0.65,
     [{"t": "каждое событие криптографически связано с предыдущим: историю лота "
            "нельзя переписать задним числом", "size": 12, "color": MUTED, "line": 1.15}])
rect(s, 7.6, 3.15, 3.3, 2.85, fill=TINT_G, round_=True, radius=0.06)
text(s, 7.86, 3.38, 2.8, 2.4, [
    {"t": "ПАСПОРТ КАЧЕСТВА", "size": 11.5, "bold": True, "font": TF,
     "color": RGBColor.from_string("375623"), "space_after": 7},
    {"t": "влажность · клейковина · натура · сорность", "size": 12, "color": TEXT,
     "space_after": 5, "line": 1.15},
    {"t": "показатели фиксируются версиями по мере обработки", "size": 11.5,
     "color": MUTED, "space_after": 7, "line": 1.15},
    {"t": "документооборот: накладные и заявки — в связке с лотом", "size": 11.5,
     "color": MUTED, "line": 1.15},
])
text(s, 0.39, 6.15, CW, 0.9, [
    {"t": "Машина состояний лота: создан → убран → хранится → отгружен → прилавок. "
          "Контур лотов реализован в системе: состояния, события, паспорт качества, "
          "граф связей партий.",
     "size": 13, "bold": True, "color": TEXT, "line": 1.2}])
notes(s, "Лот — центральная конструкция: ID партии от бункера до прилавка, hash-цепочка событий, версионный паспорт качества, документы. Реализованные состояния контура — до отгрузки; прилавок — целевое продолжение в логике «от поля до прилавка» (Фаза А KNP завершена).")

# ─────────────────────────────────────────────────────────────────
# 6 · Лотная экономика
s = content_slide("ЛОТНАЯ ЭКОНОМИКА: ПАРТИЯ КАК РАСЧЁТНАЯ ЕДИНИЦА", 5)
ecos = [
    ("Себестоимость и маржа на лот", "затраты поля, техники и обработки сходятся "
     "к конкретной партии — результат: прояснение юнит-экономики зерна"),
    ("Товарный залог", "партии на хранении — оцифрованный залог: место, объём, "
     "качество и обременения известны"),
    ("Факторинг под отгрузку", "продажа с отсрочкой перестаёт быть риском: "
     "отгрузка лота документирована"),
    ("Страхование по факту", "проверяемость событий, связанных с урожаем, "
     "и метрик качества"),
    ("Расчёты с переработчиком", "приёмка, качество и цена — по данным лота; "
     "споров «чья это пшеница» больше нет"),
    ("Прослеживаемость на экспорт", "ведение истории партии от поля — "
     "в соответствии с требованиями внешних рынков и государственных систем"),
]
for i, (ttl, d) in enumerate(ecos):
    col, row = i % 3, i // 3
    x = 0.39 + col * (3.42 + 0.13)
    y = 1.6 + row * (1.85 + 0.22)
    rect(s, x, y, 3.42, 1.85, fill=TINT if (i % 2 == 0) else TINT_G,
         round_=True, radius=0.06)
    text(s, x + 0.24, y + 0.2, 2.95, 1.5, [
        {"t": ttl, "size": 13.5, "bold": True, "color": NAVY, "space_after": 4},
        {"t": d, "size": 11, "color": TEXT, "line": 1.15},
    ])
text(s, 0.39, 5.85, CW, 0.95, [
    {"t": "Лот для аграрного оборота — то же, что SKU (карточка товара) для маркетплейса. "
          "Только физический: его можно взвесить, заложить, застраховать и продать.",
     "size": 14, "bold": True, "color": TEXT, "line": 1.22}])
notes(s, "Лотная экономика: шесть сценариев, в которых партия становится финансовым объектом. Вывод — SKU-аналогия, понятная любому банкиру.")

# ─────────────────────────────────────────────────────────────────
# 7 · Кредит под данные
s = content_slide("КРЕДИТ ПОД ДАННЫЕ, А НЕ ПОД ДЕКЛАРАЦИЮ", 6)
text(s, 0.39, 1.42, CW, 0.32,
     [{"t": "Пример расчёта: бюджеты условного хозяйства на опытном стенде платформы "
            "(демо-данные, сезон 2027):", "size": 12.5, "color": MUTED}])
cd = CategoryChartData()
cd.categories = ["Базовый 2027", "Пессимистичный 2027"]
cd.add_series("Доходы", (7395, 2873))
cd.add_series("Расходы", (4848, 1849))
gf = s.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED,
                        Inches(0.39), Inches(1.78), Inches(6.2), Inches(4.15), cd)
ch = gf.chart
ch.has_title = False
style_chart(ch)
pl = ch.plots[0]
pl.gap_width = 80
pl.overlap = -12
pl.has_data_labels = True
dl = pl.data_labels
dl.number_format = '#,##0'; dl.number_format_is_linked = False
dl.position = XL_LABEL_POSITION.OUTSIDE_END
dl.font.size = Pt(12); dl.font.bold = True; dl.font.name = BF
dl.font.color.rgb = TEXT
for i, c in enumerate([GREEN, ORANGE]):
    sr = ch.series[i]
    sr.format.fill.solid(); sr.format.fill.fore_color.rgb = c
ch.has_legend = True
ch.legend.position = XL_LEGEND_POSITION.BOTTOM
ch.legend.include_in_layout = False
ch.legend.font.size = Pt(12); ch.legend.font.name = BF
text(s, 0.39, 6.05, 6.2, 0.4,
     [{"t": "БДР демо-холдинга опытного стенда, тыс. ₽ — иллюстрация метода, "
            "а не отчёт конкретного хозяйства.",
       "size": 10.5, "color": MUTED}])
rx = 7.0
row_list(s, rx, 1.78, 3.9, [
    ("Кассовый разрыв −4 848 тыс. ₽", "в примере: расходы июня против дохода "
     "августа — предмет сезонного кредита, виден из БДДС"),
    ("Маржа пшеницы 7,08 млн ₽", "в примере: рентабельность 76,6 % — "
     "юнит-экономика культуры в той же системе"),
    ("Стресс-сценарий жизнеспособен", "падение цен и рост затрат меняют размер "
     "лимита, а не судьбу заёмщика"),
], pitch=1.3, lead_size=13.5, desc_size=11.5)
text(s, rx, 5.85, 3.9, 1.1,
     [{"t": "Размер кредита — из расчёта платформы, а не из переговорной позиции.",
       "size": 13, "bold": True, "color": TEXT, "line": 1.2}])
notes(s, "Числа — демо-данные условного хозяйства на опытном стенде (это явно сказано на слайде): БДР базовый 7 395/4 848 (+2 547), пессимистичный 2 873/1 849 (+1 024); разрыв БДДС −4 848; P&L пшеница 9 243 750/7 078 885/76,6 %. Метод — суть, цифры — иллюстрация.")

# ─────────────────────────────────────────────────────────────────
# 8 · Целевое использование
s = content_slide("ЦЕЛЕВОЕ ИСПОЛЬЗОВАНИЕ ВИДНО ПО ОПЕРАЦИЯМ", 7)
text(s, 0.39, 1.42, CW, 0.32,
     [{"t": "Пример из опытного стенда: как прототип платформы связывает деньги "
            "с операциями хозяйства (демо-данные):", "size": 12.5, "color": MUTED}])
flow = [
    ("Договор и план", "бюджет, техкарты"),
    ("Ведомость", "начисления, утверждение"),
    ("Заявка на ДС", "по строкам плана"),
    ("Оплата", "проведение, сальдо"),
]
fx, fy, fw, fh, fg = 0.39, 1.85, 2.42, 1.05, 0.27
for i, (ttl, d) in enumerate(flow):
    rect(s, fx, fy, fw, fh, fill=TINT, round_=True, radius=0.09)
    text(s, fx + 0.2, fy + 0.18, fw - 0.4, 0.75, [
        {"t": ttl, "size": 13.5, "bold": True, "color": TEXT, "space_after": 2},
        {"t": d, "size": 11, "color": MUTED, "line": 1.05},
    ])
    if i < len(flow) - 1:
        arrow(s, fx + fw + 0.02, fy + fh / 2 - 0.1, fg - 0.04, 0.2)
    fx += fw + fg
row_list(s, 0.39, 3.25, CW, [
    ("В примере проведены заявки на 900 000 и 880 000 ₽", "суммы — из строк "
     "утверждённой ведомости; значение: каждая заявка связана с назначением платежа"),
], pitch=0.6, lead_size=13.5)
screenshot(s, f"{SCR}/bank-requests.png", 0.39, 3.95, 8.2,
           caption="Реестр заявок на расходование средств (демо-данные опытного стенда): статус и сумма каждой заявки.",
           ar=BANK_AR)
notes(s, "Целевое использование: цепочка договор→ведомость→заявка→оплата. Происхождение данных объяснено на слайде (демо-данные стенда); значение — деньги связаны с операциями.")

# ─────────────────────────────────────────────────────────────────
# 9 · Жизненный цикл кредита
s = content_slide("ЖИЗНЕННЫЙ ЦИКЛ КРЕДИТА НА ПЛАТФОРМЕ", 8)
steps = [
    ("01", "Запрос", "хозяйство раскрывает свои данные — с согласия владельца"),
    ("02", "Скоринг", "земля, история, бюджеты и исполнение планов — без анкет"),
    ("03", "Выдача", "лимит — от кассового разрыва и стресс-теста"),
    ("04", "Контроль использования", "заявки на ДС связаны с техкартами и планом"),
    ("05", "Мониторинг сезона", "стресс поля виден за месяцы: факт-NDVI −28 % — сигнал"),
    ("06", "Погашение", "из реализации лотов: отгрузка документирована, выручка видна"),
]
for i, (num, ttl, d) in enumerate(steps):
    col, row = i % 3, i // 3
    x = 0.39 + col * (3.42 + 0.13)
    y = 1.6 + row * (1.95 + 0.25)
    dark = num in ("05", "06")
    rect(s, x, y, 3.42, 1.95, fill=NAVY if dark else TINT, round_=True, radius=0.07)
    text(s, x + 0.24, y + 0.2, 2.95, 1.6, [
        {"t": num, "size": 11, "bold": True, "font": TF,
         "color": RGBColor.from_string("8FAADC") if dark else BLUE, "space_after": 2},
        {"t": ttl, "size": 14, "bold": True,
         "color": RGBColor.from_string("FFFFFF") if dark else TEXT, "space_after": 4},
        {"t": d, "size": 11, "color": RGBColor.from_string("DEEBF7") if dark else MUTED,
         "line": 1.15},
    ])
text(s, 0.39, 6.2, CW, 0.85, [
    {"t": "Кредитный мониторинг становится наблюдением за сезоном в реальном времени, "
          "а не квартальной отчётностью; погашение — следом за отгрузкой лота.",
     "size": 13.5, "bold": True, "color": TEXT, "line": 1.2}])
notes(s, "Цикл целиком на платформе; акценты (тёмные) — мониторинг и погашение из лотов. NDVI −28 % и 80→69,9 ц/га — из результатов стенда.")

# ─────────────────────────────────────────────────────────────────
# 10 · Финансовые инструменты (потенциал)
s = content_slide("ПОТЕНЦИАЛ ПЛАТФОРМЫ: ФИНАНСОВЫЕ ИНСТРУМЕНТЫ", 9)
text(s, 0.39, 1.42, CW, 0.32,
     [{"t": "Направления развития — что данные платформы делают возможным "
            "(перспектива, а не текущие продукты):", "size": 12.5, "color": MUTED}])
tools = [
    ("Сезонное кредитование", "лимит от кассового разрыва и стресс-теста; "
     "график — от календаря работ"),
    ("Товарный залог", "лоты на хранении: оцифрованные объёмы, качество, обременения"),
    ("Факторинг", "дисконт отгрузки лота: событие и документы уже в контуре данных"),
    ("Индексное страхование", "триггеры по данным: NDVI-стресс и погодные события — "
     "проверяемые факты"),
    ("Расчёты и РКО", "оборот хозяйства: ведомости, заявки, акты — в одном контуре"),
    ("Отчётность для комитета", "кредитная справка и P&L — выгрузка из витрин данных"),
]
for i, (ttl, d) in enumerate(tools):
    col, row = i % 3, i // 3
    x = 0.39 + col * (3.42 + 0.13)
    y = 1.75 + row * (1.8 + 0.2)
    rect(s, x, y, 3.42, 1.8, fill=TINT if (i % 2 == 0) else TINT_G,
         round_=True, radius=0.06)
    text(s, x + 0.24, y + 0.19, 2.95, 1.45, [
        {"t": ttl, "size": 13.5, "bold": True, "color": NAVY, "space_after": 4},
        {"t": d, "size": 11, "color": TEXT, "line": 1.15},
    ])
text(s, 0.39, 5.9, CW, 0.95, [
    {"t": "Общая основа — данные, которые прототип платформы уже собирает: "
          "банку не пришлось бы строить собственный сбор, достаточно встроиться в контур.",
     "size": 13.5, "bold": True, "color": TEXT, "line": 1.22}])
notes(s, "Кадр значит: это направления развития (потенциал), не готовые продукты — сказано в подзаголовке слайда. Общая основа — данные прототипа.")

# ─────────────────────────────────────────────────────────────────
# 11 · Почему риск снижается
s = content_slide("ПОЧЕМУ СТОИМОСТЬ РИСКА СНИЖАЕТСЯ", 10)
rowsk = [
    ("Проверяемый факт вместо декларации",
     "каждое изменение данных — аудит «кто, что, старое → новое»; отчёты строит система"),
    ("Неизменяемая история оборота",
     "hash-цепочка событий лота: происхождение и качество партии нельзя переписать"),
    ("Раннее предупреждение",
     "стресс поля виден за месяцы до уборки; своевременная коррекция сохраняет "
     "маржу, из которой гасится кредит"),
    ("Стандарт данных",
     "хозяйства, сезоны и технологии сравнимы — портфель кредитов видно целиком"),
]
cy = 1.7
for i, (ttl, d) in enumerate(rowsk):
    dot(s, 0.39, cy + 0.07, 0.11, GREEN)
    text(s, 0.68, cy - 0.02, 9.8, 0.9, [
        {"t": ttl, "size": 15.5, "bold": True, "color": TEXT, "space_after": 2},
        {"t": d, "size": 12.5, "color": MUTED, "line": 1.15},
    ])
    cy += 1.18
    if i < len(rowsk) - 1:
        hair(s, 0.39, cy - 0.12, CW)
rect(s, 0.39, 6.35, CW, 0.95, fill=TINT_G, round_=True, radius=0.07)
text(s, 0.69, 6.57, CW - 0.6, 0.6,
     [{"t": "Меньше непредсказуемости — дешевле деньги для хозяйства и ниже потери для банка.",
       "size": 13.5, "bold": True, "color": RGBColor.from_string("375623")}])
notes(s, "Риск-механика: аудит, hash-цепочка, раннее предупреждение, сравнимость. Итог — снижение стоимости денег.")

# ─────────────────────────────────────────────────────────────────
# 12 · Роль банка (потенциал)
s = content_slide("РОЛЬ БАНКА: ПОТЕНЦИАЛЬНЫЕ ФОРМЫ УЧАСТИЯ", 11)
text(s, 0.39, 1.45, CW, 0.3,
     [{"t": "ПЕРСПЕКТИВА, НЕ ТЕКУЩЕЕ СОСТОЯНИЕ ПЛАТФОРМЫ", "size": 11,
       "bold": True, "color": ORANGE, "font": TF}])
row_list(s, 0.39, 1.85, 9.9, [
    ("Провайдер финансовых сервисов", "потенциально: скоринг, кредит, расчёты, "
     "залог и страхование — в контуре данных платформы"),
    ("Данные заёмщика — с согласия владельца", "принцип Data-as-a-Service: раскрытие "
     "контролирует хозяйство, а не посредник"),
    ("Новые продукты на новых данных", "лотная экономика может дать объекты, которых "
     "раньше не существовало: залог партий, факторинг отгрузок"),
    ("Ниже стоимость риска и обслуживания", "проверяемый факт и раннее предупреждение "
     "удешевляют весь цикл — от выдачи до погашения"),
], pitch=1.02, lead_size=14.5)
rect(s, 0.39, 6.15, CW, 1.05, fill=TINT, round_=True, radius=0.07)
text(s, 0.69, 6.35, CW - 0.6, 0.75,
     [{"t": "Как именно платформа будет развёртываться и какие формы участия "
            "в ней возможны — предмет будущего диалога; технологическая основа "
            "этому не препятствует: контуры независимы, интерфейсы открыты.",
       "size": 13, "bold": True, "color": NAVY, "line": 1.2}])
notes(s, "Слайд — о потенциале (помечено в подзаголовке и на плашке). Без конкретных операторов и моделей монетизации; развёртывание — предмет диалога.")

# ─────────────────────────────────────────────────────────────────
# 13 · Статус и дорожная карта
s = content_slide("СТАТУС И ДОРОЖНАЯ КАРТА ФИНАНСОВОГО КОНТУРА", 12)
phases = [
    ("СЕГОДНЯ", "данные и лоты",
     ["контур лотов реализован: состояния, hash-цепочка, паспорт качества, "
      "документооборот, граф связей",
      "бюджеты, заявки на ДС, отчёты и кредитная справка — на опытном стенде",
      "аудит изменений и шина событий"], GREEN),
    ("СЛЕДУЮЩИЙ ШАГ", "финансовые сервисы",
     ["продукты поверх лотов: залог, факторинг, индексное страхование",
      "включение ФГИС для верификации партий — вопрос УКЭП и регистрации",
      "согласование Data-as-a-Service с владельцами данных"], BLUE),
    ("ЦЕЛЬ", "платформенная экономика АПК",
     ["оборот, где каждая партия — цифровой актив с историей",
      "кредит, залог и страхование — по данным, а не по декларации",
      "финансовая инфраструктура продовольственной безопасности"], ORANGE),
]
px = 0.39
for ttl, sub, items, col in phases:
    rect(s, px, 1.6, 3.42, 4.15, fill=TINT, round_=True, radius=0.06)
    text(s, px + 0.26, 1.85, 2.9, 0.75, [
        {"t": ttl, "size": 13, "bold": True, "color": col, "font": TF, "space_after": 1},
        {"t": sub, "size": 14.5, "bold": True, "color": TEXT, "line": 1.1},
    ])
    cy = 2.8
    for it in items:
        dot(s, px + 0.26, cy + 0.05, 0.1, col)
        text(s, px + 0.5, cy - 0.03, 2.68, 0.95,
             [{"t": it, "size": 11, "color": TEXT, "line": 1.12}])
        cy += 0.92
    px += 3.42 + 0.13
text(s, 0.39, 6.0, CW, 0.9, [
    {"t": "Фундамент уже построен: лоты и данные хозяйств работают на действующем стенде — "
          "финансовые сервисы встраиваются в готовый контур.",
     "size": 13.5, "color": TEXT, "line": 1.25}])
notes(s, "Дорожная карта финансового контура: сегодня — лоты (реализовано) и бюджеты/заявки (стенд); дальше — продукты и ФГИС.")

# ─────────────────────────────────────────────────────────────────
# 14 · Финал
s = new_slide()
s.shapes.add_picture(f"{A}/image33.png", Inches(0), Inches(0),
                     width=Inches(W), height=Inches(H))
text(s, 3.0, 2.3, 6.6, 1.6,
     [{"t": "Спасибо за внимание!", "size": 44, "bold": True,
       "color": BLUE, "font": "Arial"}])
text(s, 3.05, 4.1, 8.7, 0.5,
     [{"t": "Каждая партия зерна — цифровой актив. Каждый сезон — проверяемый.",
       "size": 16, "bold": True, "color": NAVY}])
text(s, 3.05, 4.75, 8.7, 0.5,
     [{"t": "Цифровая платформа «Код Урожая» · финансовая оптика · ГУУ · 2026",
       "size": 13, "color": MUTED}])
notes(s, "Финал финансистской деки. Резерв: живой стенд — показать бюджеты, заявки, отчёты; контур лотов — по запросу.")

prs.save(OUT)
print("saved:", OUT, "slides:", len(prs.slides._sldIdLst))
