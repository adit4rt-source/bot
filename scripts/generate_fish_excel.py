import json
import os
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

with open('temp_fish_data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

fish_data = data['FISH_DATA']
fish_tiers = data['FISH_TIERS']
fishing_locations = data['FISHING_LOCATIONS']
giant_fish = data['GIANT_FISH']

tier_map = {t['tier']: t for t in fish_tiers}
loc_map = {l['id']: l for l in fishing_locations}

wb = openpyxl.Workbook()

# Style helpers
header_font = Font(name='Segoe UI', size=11, bold=True, color='FFFFFF')
header_fill = PatternFill(start_color='1F4E79', end_color='1F4E79', fill_type='solid')
accent_fill = PatternFill(start_color='2F5597', end_color='2F5597', fill_type='solid')
sub_header_fill = PatternFill(start_color='D9E1F2', end_color='D9E1F2', fill_type='solid')
sub_header_font = Font(name='Segoe UI', size=10, bold=True, color='1F4E79')

thin_border_side = Side(style='thin', color='D9D9D9')
cell_border = Border(left=thin_border_side, right=thin_border_side, top=thin_border_side, bottom=thin_border_side)
thick_bottom_side = Side(style='medium', color='1F4E79')
header_border = Border(left=thin_border_side, right=thin_border_side, top=thin_border_side, bottom=thick_bottom_side)

tier_colors = {
    'Trash': 'E0E0E0',
    'Common': 'E8F8F5',
    'Uncommon': 'D4EFDF',
    'Rare': 'D6EAF8',
    'Epic': 'E8DAEF',
    'Legendary': 'FCF3CF',
    'Mythic': 'FADBD8',
    'Secret': 'EDBB99',
    'God': 'F9E79F'
}

tier_order = ['Trash', 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Secret', 'God']
fish_data_sorted = sorted(fish_data, key=lambda x: (tier_order.index(x['tier']) if x['tier'] in tier_order else 99, x['name']))

# ==================== SHEET 1: SEMUA IKAN ====================
ws1 = wb.active
ws1.title = "Daftar Semua Ikan"
ws1.views.sheetView[0].showGridLines = True

headers1 = [
    "No", "ID Ikan", "Emoji", "Nama Ikan", "Rarity / Tier", 
    "Lokasi", "Base Chance (%)", "Min Bobot (kg)", "Max Bobot (kg)", 
    "Min Harga (Money)", "Max Harga (Money)"
]

ws1.append(headers1)
for col_idx, text in enumerate(headers1, 1):
    cell = ws1.cell(row=1, column=col_idx)
    cell.font = header_font
    cell.fill = header_fill
    cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
    cell.border = header_border
ws1.row_dimensions[1].height = 28

for idx, f in enumerate(fish_data_sorted, 1):
    tier_info = tier_map.get(f['tier'], {})
    loc_info = loc_map.get(f['location'], {})
    loc_name = loc_info.get('name', f['location'])
    
    row_data = [
        idx,
        f['id'],
        f['emoji'],
        f['name'],
        f['tier'],
        loc_name,
        tier_info.get('chance', 0),
        tier_info.get('minWeight', 0),
        tier_info.get('maxWeight', 0),
        tier_info.get('minValue', 0),
        tier_info.get('maxValue', 0)
    ]
    ws1.append(row_data)
    row_idx = idx + 1
    ws1.row_dimensions[row_idx].height = 20
    
    t_color = tier_colors.get(f['tier'], 'FFFFFF')
    tier_row_fill = PatternFill(start_color=t_color, end_color=t_color, fill_type='solid') if t_color != 'FFFFFF' else None
    
    for c_idx in range(1, len(row_data) + 1):
        c = ws1.cell(row=row_idx, column=c_idx)
        c.font = Font(name='Segoe UI', size=10)
        c.border = cell_border
        if c_idx in [1, 2, 3, 5]:
            c.alignment = Alignment(horizontal='center', vertical='center')
        elif c_idx in [7, 8, 9, 10, 11]:
            c.alignment = Alignment(horizontal='right', vertical='center')
            if c_idx in [10, 11]:
                c.number_format = '#,##0'
            elif c_idx in [7, 8, 9]:
                c.number_format = '0.00'
        else:
            c.alignment = Alignment(horizontal='left', vertical='center')
            
        if c_idx == 5 and tier_row_fill:
            c.fill = tier_row_fill

# ==================== SHEET 2: RINGKASAN RARITY ====================
ws2 = wb.create_sheet(title="Statistik Rarity")
ws2.views.sheetView[0].showGridLines = True

headers2 = [
    "Rarity / Tier", "Emoji", "Jumlah Spesies", "Base Chance (%)", 
    "Min Bobot (kg)", "Max Bobot (kg)", "Min Harga", "Max Harga", "Syarat Khusus"
]
ws2.append(headers2)
for col_idx, text in enumerate(headers2, 1):
    cell = ws2.cell(row=1, column=col_idx)
    cell.font = header_font
    cell.fill = accent_fill
    cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
    cell.border = header_border
ws2.row_dimensions[1].height = 28

requirements = {
    'Trash': 'Tidak ada',
    'Common': 'Tidak ada',
    'Uncommon': 'Tidak ada',
    'Rare': 'Tidak ada',
    'Epic': 'Bisa didapat di danau / laut pesisir ke atas',
    'Legendary': 'Umpan & Joran Tier 3+ direkomendasikan',
    'Mythic': 'Umpan & Joran Tier 5+ direkomendasikan',
    'Secret': 'Wajib Umpan & Joran Tier 6+',
    'God': 'Wajib Joran Tier 10+ & Umpan Tier tinggi'
}

for idx, t_name in enumerate(tier_order, 1):
    t_info = tier_map.get(t_name, {})
    count = sum(1 for f in fish_data if f['tier'] == t_name)
    row_data = [
        t_name,
        t_info.get('emoji', ''),
        count,
        t_info.get('chance', 0),
        t_info.get('minWeight', 0),
        t_info.get('maxWeight', 0),
        t_info.get('minValue', 0),
        t_info.get('maxValue', 0),
        requirements.get(t_name, '-')
    ]
    ws2.append(row_data)
    row_idx = idx + 1
    ws2.row_dimensions[row_idx].height = 22
    
    t_color = tier_colors.get(t_name, 'FFFFFF')
    t_fill = PatternFill(start_color=t_color, end_color=t_color, fill_type='solid')
    
    for c_idx in range(1, len(row_data) + 1):
        c = ws2.cell(row=row_idx, column=c_idx)
        c.font = Font(name='Segoe UI', size=10)
        c.border = cell_border
        if c_idx in [1, 2]:
            c.alignment = Alignment(horizontal='center', vertical='center')
            c.fill = t_fill
        elif c_idx in [3, 4, 5, 6, 7, 8]:
            c.alignment = Alignment(horizontal='right', vertical='center')
            if c_idx in [7, 8]:
                c.number_format = '#,##0'
            elif c_idx in [4, 5, 6]:
                c.number_format = '0.00'
        else:
            c.alignment = Alignment(horizontal='left', vertical='center')

# ==================== SHEET 3: GIANT BOSS FISH ====================
ws3 = wb.create_sheet(title="Giant Boss Fish")
ws3.views.sheetView[0].showGridLines = True

headers3 = [
    "No", "ID Boss", "Emoji", "Nama Boss", "Lokasi", 
    "HP (Hits Required)", "Min Reward (Money)", "Max Reward (Money)", "Deskripsi"
]
ws3.append(headers3)
for col_idx, text in enumerate(headers3, 1):
    cell = ws3.cell(row=1, column=col_idx)
    cell.font = header_font
    cell.fill = header_fill
    cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
    cell.border = header_border
ws3.row_dimensions[1].height = 28

for idx, g in enumerate(giant_fish, 1):
    loc_info = loc_map.get(g['location'], {})
    loc_name = loc_info.get('name', g['location'])
    row_data = [
        idx,
        g['id'],
        g['emoji'],
        g['name'],
        loc_name,
        g['hp'],
        g['minReward'],
        g['maxReward'],
        g['desc']
    ]
    ws3.append(row_data)
    row_idx = idx + 1
    ws3.row_dimensions[row_idx].height = 22
    for c_idx in range(1, len(row_data) + 1):
        c = ws3.cell(row=row_idx, column=c_idx)
        c.font = Font(name='Segoe UI', size=10)
        c.border = cell_border
        if c_idx in [1, 2, 3, 6]:
            c.alignment = Alignment(horizontal='center', vertical='center')
        elif c_idx in [7, 8]:
            c.alignment = Alignment(horizontal='right', vertical='center')
            c.number_format = '#,##0'
        else:
            c.alignment = Alignment(horizontal='left', vertical='center')

# ==================== SHEET 4: LOKASI MANCING ====================
ws4 = wb.create_sheet(title="Lokasi Mancing")
ws4.views.sheetView[0].showGridLines = True

headers4 = [
    "ID Lokasi", "Nama Lokasi", "Min Rod Tier", "Luck Penalty (%)", 
    "Bonus Rare (%)", "Monster Chance (%)", "Tiers Tersedia", "Deskripsi"
]
ws4.append(headers4)
for col_idx, text in enumerate(headers4, 1):
    cell = ws4.cell(row=1, column=col_idx)
    cell.font = header_font
    cell.fill = accent_fill
    cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
    cell.border = header_border
ws4.row_dimensions[1].height = 28

for idx, loc in enumerate(fishing_locations, 1):
    row_data = [
        loc['id'],
        loc['name'],
        loc['requiredRodTier'],
        loc['luckPenalty'],
        loc['bonusRare'],
        loc.get('monsterChance', 0),
        ", ".join(loc.get('tiers', [])),
        loc.get('desc', '')
    ]
    ws4.append(row_data)
    row_idx = idx + 1
    ws4.row_dimensions[row_idx].height = 22
    for c_idx in range(1, len(row_data) + 1):
        c = ws4.cell(row=row_idx, column=c_idx)
        c.font = Font(name='Segoe UI', size=10)
        c.border = cell_border
        if c_idx in [1, 3, 4, 5, 6]:
            c.alignment = Alignment(horizontal='center', vertical='center')
        else:
            c.alignment = Alignment(horizontal='left', vertical='center')

# Auto-adjust column widths for all sheets
for ws in [ws1, ws2, ws3, ws4]:
    for col in ws.columns:
        max_len = 0
        col_letter = get_column_letter(col[0].column)
        for cell in col:
            val = str(cell.value or '')
            if len(val) > max_len:
                max_len = len(val)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

output_path = os.path.abspath('daftar_ikan_lengkap.xlsx')
wb.save(output_path)
print(f"Excel file created at: {output_path}")

# Also export CSV for quick direct use
import csv
csv_path = os.path.abspath('daftar_ikan_lengkap.csv')
with open(csv_path, 'w', newline='', encoding='utf-8-sig') as f:
    writer = csv.writer(f)
    writer.writerow(headers1)
    for idx, fish in enumerate(fish_data_sorted, 1):
        tier_info = tier_map.get(fish['tier'], {})
        loc_info = loc_map.get(fish['location'], {})
        loc_name = loc_info.get('name', fish['location'])
        writer.writerow([
            idx,
            fish['id'],
            fish['emoji'],
            fish['name'],
            fish['tier'],
            loc_name,
            tier_info.get('chance', 0),
            tier_info.get('minWeight', 0),
            tier_info.get('maxWeight', 0),
            tier_info.get('minValue', 0),
            tier_info.get('maxValue', 0)
        ])
print(f"CSV file created at: {csv_path}")
