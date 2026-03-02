#!/usr/bin/env python3
"""
Example usage of the Schedule Management System.
This script demonstrates how to use the schedule module programmatically.
"""

from schedule import Event, ScheduleManager


def main():
    """Demonstrate schedule management functionality."""
    print("=== Schedule Management System - Example Usage ===\n")
    
    # Initialize the schedule manager
    manager = ScheduleManager("example_schedule.json")
    
    # Clear any existing events for clean demo
    manager.events = []
    manager.next_id = 1
    
    print("1. Adding events to the schedule...")
    event1 = manager.add_event(Event(
        "Team Meeting",
        "2026-01-15",
        "14:00",
        "Discuss Q1 project milestones"
    ))
    print(f"   Added: {event1}")
    
    event2 = manager.add_event(Event(
        "Dentist Appointment",
        "2026-01-16",
        "10:30",
        "Annual checkup"
    ))
    print(f"   Added: {event2}")
    
    event3 = manager.add_event(Event(
        "Lunch with Client",
        "2026-01-15",
        "12:00",
        "Restaurant meeting"
    ))
    print(f"   Added: {event3}")
    
    print("\n2. Listing all events...")
    all_events = manager.list_events()
    for event in all_events:
        print(f"   {event}")
    
    print("\n3. Filtering events by date (2026-01-15)...")
    filtered_events = manager.list_events("2026-01-15")
    for event in filtered_events:
        print(f"   {event}")
    
    print("\n4. Getting a specific event (ID: 1)...")
    specific_event = manager.get_event(1)
    if specific_event:
        print(f"   {specific_event}")
    
    print("\n5. Updating an event (changing time and description)...")
    manager.update_event(1, time="15:00", description="Updated: Discuss Q1 and Q2 milestones")
    updated_event = manager.get_event(1)
    print(f"   Updated: {updated_event}")
    
    print("\n6. Deleting an event (ID: 2)...")
    manager.delete_event(2)
    print("   Event deleted")
    
    print("\n7. Final event list...")
    final_events = manager.list_events()
    for event in final_events:
        print(f"   {event}")
    
    print("\n=== Example completed successfully ===")
    print(f"Data saved to: example_schedule.json")


if __name__ == "__main__":
    main()
