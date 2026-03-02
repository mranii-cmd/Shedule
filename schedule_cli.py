#!/usr/bin/env python3
"""
Command-line interface for the Schedule Management System.
"""

import sys
from schedule import Event, ScheduleManager


def print_help():
    """Print help information."""
    print("""
Schedule Management System - Command Line Interface

Usage:
    python schedule_cli.py <command> [arguments]

Commands:
    add <title> <date> <time> [description]
        Add a new event to the schedule
        Example: python schedule_cli.py add "Team Meeting" 2026-01-15 14:30 "Discuss project updates"

    list [date]
        List all events, optionally filtered by date
        Example: python schedule_cli.py list
        Example: python schedule_cli.py list 2026-01-15

    show <id>
        Show details of a specific event
        Example: python schedule_cli.py show 1

    update <id> [--title TITLE] [--date DATE] [--time TIME] [--description DESC]
        Update an existing event
        Example: python schedule_cli.py update 1 --title "Updated Meeting" --time 15:00

    delete <id>
        Delete an event
        Example: python schedule_cli.py delete 1

    help
        Show this help message

Date format: YYYY-MM-DD (e.g., 2026-01-15)
Time format: HH:MM (e.g., 14:30)
""")


def main():
    """Main entry point for the CLI."""
    if len(sys.argv) < 2:
        print("Error: No command provided")
        print_help()
        sys.exit(1)
    
    command = sys.argv[1].lower()
    manager = ScheduleManager()
    
    if command == "help":
        print_help()
    
    elif command == "add":
        if len(sys.argv) < 5:
            print("Error: 'add' requires at least title, date, and time")
            print("Usage: python schedule_cli.py add <title> <date> <time> [description]")
            sys.exit(1)
        
        title = sys.argv[2]
        date = sys.argv[3]
        time = sys.argv[4]
        description = " ".join(sys.argv[5:]) if len(sys.argv) > 5 else ""
        
        event = Event(title, date, time, description)
        added_event = manager.add_event(event)
        print(f"Event added successfully: {added_event}")
    
    elif command == "list":
        date_filter = sys.argv[2] if len(sys.argv) > 2 else None
        events = manager.list_events(date_filter)
        
        if not events:
            print("No events found")
        else:
            print(f"\nScheduled Events ({len(events)}):")
            print("-" * 60)
            for event in events:
                print(event)
            print("-" * 60)
    
    elif command == "show":
        if len(sys.argv) < 3:
            print("Error: 'show' requires an event ID")
            print("Usage: python schedule_cli.py show <id>")
            sys.exit(1)
        
        try:
            event_id = int(sys.argv[2])
            event = manager.get_event(event_id)
            if event:
                print(f"\nEvent Details:")
                print(f"  ID: {event.id}")
                print(f"  Title: {event.title}")
                print(f"  Date: {event.date}")
                print(f"  Time: {event.time}")
                print(f"  Description: {event.description}")
            else:
                print(f"Error: Event with ID {event_id} not found")
                sys.exit(1)
        except ValueError:
            print("Error: Event ID must be a number")
            sys.exit(1)
    
    elif command == "update":
        if len(sys.argv) < 3:
            print("Error: 'update' requires an event ID")
            print("Usage: python schedule_cli.py update <id> [--title TITLE] [--date DATE] [--time TIME] [--description DESC]")
            sys.exit(1)
        
        try:
            event_id = int(sys.argv[2])
            
            # Parse optional arguments
            title = None
            date = None
            time = None
            description = None
            
            i = 3
            while i < len(sys.argv):
                if sys.argv[i] == "--title" and i + 1 < len(sys.argv):
                    title = sys.argv[i + 1]
                    i += 2
                elif sys.argv[i] == "--date" and i + 1 < len(sys.argv):
                    date = sys.argv[i + 1]
                    i += 2
                elif sys.argv[i] == "--time" and i + 1 < len(sys.argv):
                    time = sys.argv[i + 1]
                    i += 2
                elif sys.argv[i] == "--description" and i + 1 < len(sys.argv):
                    description = sys.argv[i + 1]
                    i += 2
                else:
                    i += 1
            
            if manager.update_event(event_id, title, date, time, description):
                event = manager.get_event(event_id)
                print(f"Event updated successfully: {event}")
            else:
                print(f"Error: Event with ID {event_id} not found")
                sys.exit(1)
        except ValueError:
            print("Error: Event ID must be a number")
            sys.exit(1)
    
    elif command == "delete":
        if len(sys.argv) < 3:
            print("Error: 'delete' requires an event ID")
            print("Usage: python schedule_cli.py delete <id>")
            sys.exit(1)
        
        try:
            event_id = int(sys.argv[2])
            if manager.delete_event(event_id):
                print(f"Event {event_id} deleted successfully")
            else:
                print(f"Error: Event with ID {event_id} not found")
                sys.exit(1)
        except ValueError:
            print("Error: Event ID must be a number")
            sys.exit(1)
    
    else:
        print(f"Error: Unknown command '{command}'")
        print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
