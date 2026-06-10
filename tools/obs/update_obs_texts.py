#!/usr/bin/env python3
import os
import sys

# Define debate rounds
DEBATE_ROUNDS = [
    {
        "id": 1,
        "topic": "Ronda 1/5: La Paradoja de Ventas",
        "question": "¿Por qué aumenta el consumo de leche cruda si hay alertas sanitarias por Gripe Aviar H5N1?",
        "chat": "CHAT (Mito): \"Es más natural y saludable. La alerta de gripe aviar es solo miedo metido por el gobierno para controlarnos y obligarnos a tomar leche industrial procesada.\"",
        "auta": "AutaMedica (Evidencia): La desconfianza no borra el riesgo biológico. Las ventas de leche cruda subieron hasta un 65% tras confirmarse H5N1, vendiendo peligro como si fuera libertad. La pasteurización no es control: es una barrera sanitaria indispensable."
    },
    {
        "id": 2,
        "topic": "Ronda 2/5: Mitos de la Pasteurización",
        "question": "¿Es cierto que la pasteurización le quita valor nutricional a la leche y la vuelve 'artificial'?",
        "chat": "CHAT (Mito): \"La pasteurización 'cocina' la leche, le quita las enzimas curativas y destruye el calcio y los nutrientes esenciales.\"",
        "auta": "AutaMedica (Evidencia): Falso. La pasteurización es un choque térmico controlado (ej. 72°C por 15 seg). La FDA confirma que inactiva bacterias peligrosas (E. coli, Listeria, Salmonella) sin alterar de manera significativa la calidad nutricional del alimento."
    },
    {
        "id": 3,
        "topic": "Ronda 3/5: El Mito de la Granja Limpia",
        "question": "Si la leche viene de vacas sanas en una granja limpia e higiénica, ¿sigue habiendo riesgo?",
        "chat": "CHAT (Mito): \"Si la granja es de confianza y las vacas están limpias, no hay bacterias. La contaminación solo ocurre en la granjas industriales masivas.\"",
        "auta": "AutaMedica (Evidencia): La contaminación biológica es microscópica e invisible. No altera el olor, sabor ni aspecto de la leche. Incluso granjas con excelentes controles de higiene reportan brotes debido a la carga patógena natural de las ubres."
    },
    {
        "id": 4,
        "topic": "Ronda 4/5: Gripe Aviar (H5N1) en Ganado",
        "question": "¿Hay un riesgo real de Gripe Aviar H5N1 en la leche comercial hoy?",
        "chat": "CHAT (Mito): \"La gripe aviar en vacas es una exageración mediática. Quieren prohibir la leche directa del campo para beneficiar a las grandes corporaciones.\"",
        "auta": "AutaMedica (Evidencia): El brote de H5N1 en vacas lecheras de EE.UU. es real. La FDA demostró que la pasteurización comercial inactiva por completo el virus H5N1, haciendo la leche de supermercado 100% segura. Consumir leche cruda es una ruleta rusa viral."
    },
    {
        "id": 5,
        "topic": "Ronda 5/5: Lactosa y Digestión",
        "question": "¿La leche cruda ayuda con la intolerancia a la lactosa porque contiene lactasa?",
        "chat": "CHAT (Mito): \"La leche cruda viene con lactasa activa que te ayuda a digerirla de forma natural. Al pasteurizarla, destruyen esa enzima y te volvés intolerante.\"",
        "auta": "AutaMedica (Evidencia): Mito absoluto desmontado por la FDA. La leche cruda tiene la misma cantidad de lactosa y no contiene lactasa utilizable en el cuerpo humano. No previene ni cura la intolerancia; solo le añade el riesgo de gastroenteritis grave."
    }
]

# Output files
DIR_PATH = os.path.dirname(os.path.abspath(__file__))
FILE_TOPIC = os.path.join(DIR_PATH, "RondaStatus.txt")
FILE_QUESTION = os.path.join(DIR_PATH, "TituloDebate.txt")
FILE_CHAT = os.path.join(DIR_PATH, "ChatMito.txt")
FILE_AUTA = os.path.join(DIR_PATH, "AutamedicaEvidencia.txt")

def write_round_files(round_index):
    if round_index < 0 or round_index >= len(DEBATE_ROUNDS):
        print(f"Error: Índice {round_index} fuera de rango.")
        return False
        
    r = DEBATE_ROUNDS[round_index]
    
    try:
        with open(FILE_TOPIC, 'w', encoding='utf-8') as f:
            f.write(r["topic"])
        with open(FILE_QUESTION, 'w', encoding='utf-8') as f:
            f.write(r["question"])
        with open(FILE_CHAT, 'w', encoding='utf-8') as f:
            f.write(r["chat"])
        with open(FILE_AUTA, 'w', encoding='utf-8') as f:
            f.write(r["auta"])
        print(f"\n✅ Archivos actualizados con éxito para: {r['topic']}")
        print(f"  - TituloDebate.txt -> {r['question'][:40]}...")
        return True
    except Exception as e:
        print(f"❌ Error al escribir archivos: {e}")
        return False

def show_menu():
    while True:
        print("\n=============================================")
        print("    CONTROLLER DE TEXTO PARA OBS - AUTAMEDICA vs CHAT")
        print("=============================================")
        for i, r in enumerate(DEBATE_ROUNDS):
            print(f"[{i+1}] {r['topic']}: {r['question'][:50]}...")
        print("[0] Salir")
        print("=============================================")
        
        try:
            choice = input("Selecciona una ronda para mostrar en OBS: ").strip()
            if choice == '0':
                print("Saliendo del controlador.")
                break
            
            val = int(choice)
            if 1 <= val <= len(DEBATE_ROUNDS):
                write_round_files(val - 1)
            else:
                print("Opción inválida. Elige un número del 1 al 5.")
        except ValueError:
            print("Entrada no válida. Escribe un número.")
        except KeyboardInterrupt:
            print("\nSaliendo...")
            break

if __name__ == "__main__":
    # If round index is passed as command line argument
    if len(sys.argv) > 1:
        try:
            arg_val = int(sys.argv[1])
            if 1 <= arg_val <= len(DEBATE_ROUNDS):
                write_round_files(arg_val - 1)
            else:
                print(f"Error: La ronda debe ser entre 1 y {len(DEBATE_ROUNDS)}")
        except ValueError:
            print("Error: El argumento debe ser un número entero.")
    else:
        # Show interactive CLI menu
        show_menu()
