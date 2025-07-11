import streamlit as st
import matplotlib.pyplot as plt
import json
import time
import os

METRICS_FILE = "training_metrics_data.json"
st.set_page_config(layout="wide")
st.title("Reverisi AI dashboard")

loss_chart = st.empty()
accuracy_chart = st.empty()

def load_metrics_data():
    if os.path.exists(METRICS_FILE):
        try:
            with open(METRICS_FILE, "r") as f:
                content = f.read()
                if content:
                    return json.loads(content)
        except json.JSONDecodeError:
            pass
    return {"val_loss": [], "policy_output_kl_divergence": [], "value_output_mean_absolute_error": []}

def update_charts():
    data = load_metrics_data()
    losses = data.get("val_loss", [])
    policy_accuracies = data.get("policy_output_kl_divergence", [])
    value_maes = data.get("value_output_mean_absolute_error", [])

    if not losses:
        loss_chart.write("No train data")
        accuracy_chart.write("")
        return

    epochs_ran = len(losses)
    x_axis = list(range(1, epochs_ran + 1))

    fig_loss, ax_loss = plt.subplots(figsize=(10, 5))
    ax_loss.plot(x_axis, losses, label='Validation Loss')
    ax_loss.set_title('Loss per Batch')
    ax_loss.set_xlabel('Batch per N games')
    ax_loss.set_ylabel('Loss')
    ax_loss.legend()
    ax_loss.grid(True)
    loss_chart.pyplot(fig_loss)
    plt.close(fig_loss)

    fig_acc, ax_acc = plt.subplots(figsize=(10, 5))
    ax_acc.plot(x_axis, policy_accuracies, label='KL')
    ax_acc.plot(x_axis, value_maes, label='MAE')
    ax_acc.set_title('KL & MAE per Batch')
    ax_acc.set_xlabel('Batch per N games')
    ax_acc.set_ylabel('MAE')
    ax_acc.legend()
    ax_acc.grid(True)
    accuracy_chart.pyplot(fig_acc)
    plt.close(fig_acc)

while True:
    update_charts()
    time.sleep(5)
