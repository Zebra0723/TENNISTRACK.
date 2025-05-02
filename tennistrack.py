# TENNISTRACK – full feature edition
# Run:  streamlit run tennistrack.py

import streamlit as st, pandas as pd, os, altair as alt
from datetime import datetime

st.set_page_config(page_title="TENNISTRACK", layout="centered")
DATA = "tt_data.csv"
PASSWORD = "vortexmaster2025"

round_scores = {
    "Champion":0, "Runner-Up":1, "Semi-Final":2, "Quarter-Final":4,
    "Round of 16":8, "Round of 32":16, "Round of 64":32,
    "Round of 128":64, "Round of 256":128
}

# ---------- helpers ----------
def load():
    if os.path.exists(DATA):
        return pd.read_csv(DATA)
    return pd.DataFrame(columns=["Tournament","Player","Round","Score","Time"])

def save(df): df.to_csv(DATA, index=False)

def fresh_row(tour, player, rnd):
    return {
        "Tournament": tour,
        "Player": player,
        "Round": rnd,
        "Score": round_scores[rnd],
        "Time": datetime.now().strftime("%Y-%m-%d %H:%M")
    }

# ---------- UI ---------------
st.title("🎾 TENNISTRACK")
st.caption("Log where players finish & see who stayed alive the longest (lower score = better).")

with st.form("add"):
    col1, col2, col3 = st.columns(3)
    tournament = col1.text_input("Tournament (e.g. Wimbledon 2025)")
    player     = col2.text_input("Player Name")
    rnd        = col3.selectbox("Round Reached", list(round_scores.keys()))
    submitted  = st.form_submit_button("Add / Update")

    if submitted and tournament and player:
        df = load()
        # remove existing record for same tournament+player
        df = df[~((df.Tournament == tournament) & (df.Player == player))]
        df = pd.concat([df, pd.DataFrame([fresh_row(tournament, player, rnd)])],
                       ignore_index=True)
        save(df)
        st.success(f"{player} ({tournament}) saved!")

df = load()
if df.empty:
    st.info("No data yet – add some players above. 👆")
    st.stop()

# ---------- Filters ----------
with st.expander("📊 View Options", expanded=True):
    tours = ["All tournaments"] + sorted(df.Tournament.unique())
    choice = st.selectbox("Select tournament", tours)
    chart_type = st.radio("Chart type", ["Bar", "Line", "Pie"], horizontal=True)

view_df = df if choice == "All tournaments" else df[df.Tournament == choice]

st.subheader(f"🏆 Leaderboard – {choice}")
st.dataframe(view_df.sort_values("Score").reset_index(drop=True), use_container_width=True)

# ---------- Charts ----------
if chart_type == "Bar":
    bar = alt.Chart(view_df).mark_bar().encode(
        x=alt.X("Player", sort="-y"),
        y="Score",
        color=alt.Color("Player", legend=None)
    )
    st.altair_chart(bar, use_container_width=True)

elif chart_type == "Line":
    line = alt.Chart(view_df).mark_line(point=True).encode(
        x="Player", y="Score", group="Tournament", color="Player"
    )
    st.altair_chart(line, use_container_width=True)

else:  # Pie
    pie_data = view_df.groupby("Player")["Score"].sum().reset_index()
    pie = alt.Chart(pie_data).mark_arc().encode(
        theta="Score",
        color="Player"
    )
    st.altair_chart(pie, use_container_width=True)

# ---------- God-Mode reset ----------
with st.expander("👑 God-Mode"):
    pwd = st.text_input("Password", type="password")
    if st.button("🔥 RESET ALL DATA") and pwd == PASSWORD:
        if os.path.exists(DATA): os.remove(DATA)
        st.warning("Leaderboard wiped – fresh start!")
        st.experimental_rerun()
